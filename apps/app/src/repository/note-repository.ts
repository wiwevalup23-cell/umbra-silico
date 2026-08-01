import { z } from 'zod'
import {
  createCryptoService,
  createKeyring,
  type CryptoService,
  type Keyring,
} from '@/crypto'
import type { LocalNotesStore } from '@/local-store/contracts'
import type {
  LockNoteResult,
  NoteBackupData,
  NoteBackupRestoreReport,
  NoteRepository,
} from '@/repository/contracts/note-repository'
import {
  LiveQueryRegistry,
  noteListSignature,
  StoreBackedLiveQuery,
  type LiveQueryTag,
} from '@/repository/live-query'
import { mapLocalNoteToSyncPayload } from '@/repository/mappers/local-note-mapper'
import { mapRemoteChangeToLocalNote } from '@/repository/mappers/remote-note-mapper'
import {
  defaultNoteHistoryRetention,
  selectExpiredNoteOps,
  type NoteHistoryRetentionPolicy,
} from '@/repository/note-history'
import { createNotePreview, createNoteSearchText } from '@/shared/document-text'
import {
  createDraftLocalNote,
  createNoteInputSchema,
  deviceIdSchema,
  documentV1Contract,
  encryptedLocalNoteSchema,
  folderIdSchema,
  lockCredentialsSchema,
  noteDocumentSchema,
  notePropertiesSchema,
  localNoteSchema,
  noteIdSchema,
  noteVersionSchema,
  operationIdSchema,
  plaintextLocalNoteSchema,
  toPlaintextListItem,
  unlockCredentialsSchema,
  updateNotePatchSchema,
  userIdSchema,
  wouldCreateCycle,
  type ConflictRecord,
  type CreateNoteInput,
  type DeviceId,
  type EncryptedLocalNote,
  type FolderId,
  type FolderTreeNode,
  type LocalFolder,
  type LocalNote,
  type NoteId,
  type NoteListItem,
  type NoteListQuery,
  type NoteVersion,
  type OperationId,
  type PlaintextLocalNote,
  type SyncOperation,
  type SyncOperationType,
  type UnlockedNoteSession,
  type UpdateNotePatch,
  type UserId,
  type AutomationEvent,
} from '@/shared/contracts'

export type RepositoryIdFactory = (prefix: 'folder' | 'note' | 'op') => string
export type RepositoryClock = () => string
export type RepositoryAutomationEventSink = {
  emit(event: AutomationEvent): Promise<unknown>
}

export type DefaultNoteRepositoryDependencies = {
  automationEvents?: RepositoryAutomationEventSink
  cryptoService?: CryptoService
  keyring?: Keyring
  localStore: LocalNotesStore
  userId: UserId | string
  deviceId: DeviceId | string
  clock?: RepositoryClock
  idFactory?: RepositoryIdFactory
  historyRetention?: NoteHistoryRetentionPolicy
  /** How many writes to a note pass before its history is re-evaluated. */
  historyPruneEveryWrites?: number
}

const defaultIdFactory: RepositoryIdFactory = (prefix) =>
  `${prefix}_${globalThis.crypto.randomUUID()}`

const defaultClock: RepositoryClock = () => new Date().toISOString()
const unlockedSessionDurationMs = 15 * 60 * 1000
const defaultPruneEveryWrites = 20

const lockedNotePayloadSchema = z.object({
  version: z.literal(1),
  title: z.string().min(1),
  preview: z.string(),
  document: noteDocumentSchema,
  properties: notePropertiesSchema.default({ kind: 'standard', status: 'none', tags: [] }),
})

type LockedNotePayload = z.infer<typeof lockedNotePayloadSchema>

/**
 * Reads the note snapshot an outbox operation carries, tolerating payloads
 * written by older builds rather than failing a whole history listing.
 */
function readOperationSnapshot(op: SyncOperation): LocalNote | null {
  const payload = op.payload as { note?: unknown }
  const parsed = localNoteSchema.safeParse(payload.note)

  return parsed.success ? parsed.data : null
}

/**
 * Both callers hand in either a plaintext note or the decrypted note from an
 * unlock session, so reaching the throw means that substitution was missed
 * rather than that the user did anything wrong — `requireUnlockedSession`
 * already reports the missing-session case.
 */
function assertPlaintextNote(note: LocalNote): PlaintextLocalNote {
  if (note.isLocked) {
    throw new Error(
      `Note ${note.id} is still encrypted here; an unlock session must supply its plaintext first.`,
    )
  }

  return note
}

function buildFolderTree(
  folders: LocalFolder[],
  notes: NoteListItem[],
): FolderTreeNode[] {
  const noteCounts = new Map<FolderId, number>()

  for (const note of notes) {
    if (note.parentFolderId) {
      noteCounts.set(note.parentFolderId, (noteCounts.get(note.parentFolderId) ?? 0) + 1)
    }
  }

  const nodes = new Map<FolderId, FolderTreeNode>(
    folders.map((folder) => [
      folder.id,
      {
        children: [],
        folder,
        noteCount: noteCounts.get(folder.id) ?? 0,
      },
    ]),
  )
  const roots: FolderTreeNode[] = []

  for (const folder of folders) {
    const node = nodes.get(folder.id)

    if (!node) {
      continue
    }

    const parent = folder.parentFolderId ? nodes.get(folder.parentFolderId) : null

    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  function sortNodes(items: FolderTreeNode[]) {
    items.sort((left, right) => {
      const sortDiff = left.folder.sortIndex - right.folder.sortIndex
      return sortDiff === 0
        ? left.folder.name.localeCompare(right.folder.name)
        : sortDiff
    })
    items.forEach((item) => sortNodes(item.children))
  }

  sortNodes(roots)
  return roots
}

export class DefaultNoteRepository implements NoteRepository {
  private readonly automationEvents: RepositoryAutomationEventSink | null
  private readonly cryptoService: CryptoService
  private readonly localStore: LocalNotesStore
  private readonly userId: UserId
  private readonly deviceId: DeviceId
  private readonly clock: RepositoryClock
  private readonly idFactory: RepositoryIdFactory
  private readonly keyring: Keyring
  private readonly liveQueries = new LiveQueryRegistry()
  private readonly historyRetention: NoteHistoryRetentionPolicy
  private readonly historyPruneEveryWrites: number
  // Pruning reads a note's whole op list, so it runs on a cadence rather than
  // on every keystroke-driven save.
  private readonly writesSincePrune = new Map<NoteId, number>()
  private readonly unlockedSessions = new Map<
    NoteId,
    {
      expiresAt: string
      note: PlaintextLocalNote
    }
  >()

  constructor(dependencies: DefaultNoteRepositoryDependencies) {
    this.automationEvents = dependencies.automationEvents ?? null
    this.cryptoService = dependencies.cryptoService ?? createCryptoService()
    this.localStore = dependencies.localStore
    this.userId = userIdSchema.parse(dependencies.userId)
    this.deviceId = deviceIdSchema.parse(dependencies.deviceId)
    this.clock = dependencies.clock ?? defaultClock
    this.idFactory = dependencies.idFactory ?? defaultIdFactory
    this.keyring = dependencies.keyring ?? createKeyring(this.cryptoService)
    this.historyRetention = dependencies.historyRetention ?? defaultNoteHistoryRetention
    this.historyPruneEveryWrites =
      dependencies.historyPruneEveryWrites ?? defaultPruneEveryWrites
  }

  liveNoteList(query: NoteListQuery = {}) {
    return this.registerLiveQuery(
      new StoreBackedLiveQuery<NoteListItem[]>({
        initialSnapshot: [],
        loadSnapshot: async () =>
          this.filterNoteList(
            await this.getVisibleNoteList(),
            query,
            await this.localStore.listFolders(),
          ),
        onDispose: (disposed) => this.liveQueries.unregister(disposed),
        onRetain: (retained) => this.liveQueries.register(retained),
        signature: noteListSignature,
        tags: ['notes'],
      }),
    )
  }

  liveTrashList() {
    return this.registerLiveQuery(
      new StoreBackedLiveQuery<NoteListItem[]>({
        initialSnapshot: [],
        loadSnapshot: () => this.getVisibleTrashList(),
        onDispose: (disposed) => this.liveQueries.unregister(disposed),
        onRetain: (retained) => this.liveQueries.register(retained),
        signature: noteListSignature,
        tags: ['trash'],
      }),
    )
  }

  liveFolderTree() {
    return this.registerLiveQuery(
      new StoreBackedLiveQuery<FolderTreeNode[]>({
        initialSnapshot: [],
        loadSnapshot: async () =>
          buildFolderTree(await this.localStore.listFolders(), await this.localStore.listNotes()),
        onDispose: (disposed) => this.liveQueries.unregister(disposed),
        onRetain: (retained) => this.liveQueries.register(retained),
        tags: ['folders'],
      }),
    )
  }

  liveNote(noteId: NoteId) {
    return this.registerLiveQuery(
      new StoreBackedLiveQuery<LocalNote | null>({
        initialSnapshot: null,
        loadSnapshot: () => this.getVisibleNote(noteId),
        onDispose: (disposed) => this.liveQueries.unregister(disposed),
        onRetain: (retained) => this.liveQueries.register(retained),
        // Serializing the note would mean serializing its whole document on
        // every refresh. localRevision already advances on each write, and
        // isLocked covers unlock sessions, which reuse the stored revision.
        signature: (note) =>
          note
            ? `${note.id}|${note.localRevision}|${note.remoteRevision ?? ''}|${
                note.updatedAt
              }|${note.syncStatus}|${note.isLocked ? 1 : 0}|${note.parentFolderId ?? ''}`
            : '',
        tags: [`note:${noteId}`],
      }),
    )
  }

  private registerLiveQuery<TValue>(
    liveQuery: StoreBackedLiveQuery<TValue>,
  ): StoreBackedLiveQuery<TValue> {
    this.liveQueries.register(liveQuery)
    return liveQuery
  }

  getNote(noteId: NoteId) {
    return this.localStore.getNote(noteId)
  }

  async createNote(input: CreateNoteInput = {}): Promise<NoteId> {
    const parsedInput = createNoteInputSchema.parse(input)
    const now = this.clock()
    const noteId = noteIdSchema.parse(this.idFactory('note'))
    const opId = this.createOperationId()
    const note = createDraftLocalNote({
      id: noteId,
      userId: this.userId,
      deviceId: this.deviceId,
      now,
      title: parsedInput.title,
      document: parsedInput.document ?? documentV1Contract.createEmpty(),
      parentFolderId: parsedInput.parentFolderId ?? null,
      properties: parsedInput.properties,
    })

    const noteWithOp: PlaintextLocalNote = {
      ...note,
      preview: createNotePreview(note.document),
      localRevision: 1,
      lastOpId: opId,
    }
    const op = this.createOperation('note.create', noteWithOp, opId)

    await this.persistNoteWithOp(noteWithOp, op)
    await this.emitAutomationEvent({ type: 'note.created', noteId })
    await this.invalidateNote(noteId, ['folders'])

    return noteId
  }

  async createFolder(input: {
    name: string
    parentFolderId?: FolderId | null
  }): Promise<FolderId> {
    const name = input.name.trim()

    if (!name) {
      throw new Error('Folder name is required.')
    }

    const folders = await this.localStore.listFolders()
    const parentFolderId = input.parentFolderId ?? null

    if (parentFolderId && !folders.some((folder) => folder.id === parentFolderId)) {
      throw new Error(`Folder ${parentFolderId} does not exist.`)
    }

    const now = this.clock()
    const folder: LocalFolder = {
      id: folderIdSchema.parse(this.idFactory('folder')),
      userId: this.userId,
      name,
      parentFolderId,
      sortIndex: folders.length,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      localRevision: 1,
      syncStatus: 'dirty',
      deviceId: this.deviceId,
    }

    await this.localStore.putFolder(folder)
    await this.liveQueries.invalidate(['folders'])
    return folder.id
  }

  async renameFolder(folderId: FolderId, name: string): Promise<void> {
    const folder = await this.requireFolder(folderId)
    const nextName = name.trim()

    if (!nextName) {
      throw new Error('Folder name is required.')
    }

    await this.localStore.putFolder({
      ...folder,
      name: nextName,
      updatedAt: this.clock(),
      localRevision: folder.localRevision + 1,
      syncStatus: 'dirty',
    })
    await this.liveQueries.invalidate(['folders'])
  }

  async moveFolder(folderId: FolderId, parentFolderId: FolderId | null): Promise<void> {
    const folders = await this.localStore.listFolders()
    const folder = folders.find((candidate) => candidate.id === folderId)

    if (!folder) {
      throw new Error(`Folder ${folderId} does not exist.`)
    }

    if (parentFolderId && !folders.some((candidate) => candidate.id === parentFolderId)) {
      throw new Error(`Folder ${parentFolderId} does not exist.`)
    }

    if (wouldCreateCycle(folders, folderId, parentFolderId)) {
      throw new Error('Cannot move a folder inside itself or one of its children.')
    }

    await this.localStore.putFolder({
      ...folder,
      parentFolderId,
      updatedAt: this.clock(),
      localRevision: folder.localRevision + 1,
      syncStatus: 'dirty',
    })
    await this.liveQueries.invalidate(['folders'])
  }

  async deleteFolder(folderId: FolderId): Promise<void> {
    const folder = await this.requireFolder(folderId)
    const now = this.clock()
    const folders = await this.localStore.listFolders()
    const notes = await this.localStore.listNotes()

    for (const childFolder of folders.filter(
      (candidate) => candidate.parentFolderId === folderId,
    )) {
      await this.localStore.putFolder({
        ...childFolder,
        parentFolderId: folder.parentFolderId,
        updatedAt: now,
        localRevision: childFolder.localRevision + 1,
        syncStatus: 'dirty',
      })
    }

    for (const note of notes.filter((candidate) => candidate.parentFolderId === folderId)) {
      await this.reparentNote(note.id, folder.parentFolderId)
    }

    await this.localStore.softDeleteFolder(folderId, now)
    await this.liveQueries.invalidate(['folders', 'notes'])
  }

  moveNoteToFolder(noteId: NoteId, folderId: FolderId | null): Promise<void> {
    return this.reparentNote(noteId, folderId)
  }

  /**
   * Moves a note between folders by updating only the parentFolderId metadata.
   * parentFolderId lives outside the encrypted payload, so this works for locked
   * notes without an unlock session and never touches ciphertext.
   */
  private async reparentNote(
    noteId: NoteId,
    folderId: FolderId | null,
  ): Promise<void> {
    const existing = await this.requireNote(noteId)

    if (existing.parentFolderId === folderId) {
      return
    }

    const opId = this.createOperationId()
    const now = this.clock()
    const reparentedNote: LocalNote = {
      ...existing,
      parentFolderId: folderId,
      updatedAt: now,
      localRevision: existing.localRevision + 1,
      syncStatus: 'dirty',
      lastOpId: opId,
    }
    const op = this.createOperation('note.update', reparentedNote, opId)

    await this.persistNoteWithOp(reparentedNote, op)
    this.reparentUnlockedSession(noteId, folderId, now, reparentedNote.localRevision)
    await this.emitAutomationEvent({
      type: 'note.updated',
      noteId,
      changedFields: ['parentFolderId'],
    })
    await this.invalidateNote(noteId, ['folders'])
  }

  /**
   * Keeps an active unlocked session consistent after a metadata-only reparent so
   * the next edit does not fail the stale-session revision check.
   */
  private reparentUnlockedSession(
    noteId: NoteId,
    folderId: FolderId | null,
    updatedAt: string,
    localRevision: number,
  ): void {
    const session = this.unlockedSessions.get(noteId)

    if (!session) {
      return
    }

    this.unlockedSessions.set(noteId, {
      ...session,
      note: {
        ...session.note,
        parentFolderId: folderId,
        updatedAt,
        localRevision,
      },
    })
  }

  async updateNote(noteId: NoteId, patch: UpdateNotePatch): Promise<void> {
    const parsedPatch = updateNotePatchSchema.parse(patch)
    const existing = await this.requireNote(noteId)
    const plaintextNote = assertPlaintextNote(
      existing.isLocked ? this.requireUnlockedSession(noteId, existing) : existing,
    )
    const document = parsedPatch.document ?? plaintextNote.document
    const opId = this.createOperationId()
    const updatedNote: PlaintextLocalNote = {
      ...plaintextNote,
      title: parsedPatch.title ?? plaintextNote.title,
      parentFolderId:
        parsedPatch.parentFolderId !== undefined
          ? parsedPatch.parentFolderId
          : plaintextNote.parentFolderId,
      preview: createNotePreview(document),
      document,
      properties: parsedPatch.properties ?? plaintextNote.properties,
      updatedAt: this.clock(),
      localRevision: plaintextNote.localRevision + 1,
      syncStatus: 'dirty',
      lastOpId: opId,
    }
    // The folder tree carries per-folder note counts, so it only needs
    // refreshing when this write actually moved the note between folders.
    const folderTags: LiveQueryTag[] =
      updatedNote.parentFolderId === existing.parentFolderId ? [] : ['folders']

    if (existing.isLocked) {
      const encryptedNote = await this.encryptPlaintextNote(
        updatedNote,
        existing,
        opId,
        'dirty',
      )
      const op = this.createOperation('note.update', encryptedNote, opId)

      await this.persistNoteWithOp(encryptedNote, op)
      this.storeUnlockedSession(updatedNote)
      await this.emitAutomationEvent({
        type: 'note.updated',
        noteId,
        changedFields: Object.keys(parsedPatch),
      })
      await this.invalidateNote(noteId, folderTags)
      return
    }

    const op = this.createOperation('note.update', updatedNote, opId)

    await this.persistNoteWithOp(updatedNote, op)
    await this.emitAutomationEvent({
      type: 'note.updated',
      noteId,
      changedFields: Object.keys(parsedPatch),
    })
    await this.invalidateNote(noteId, folderTags)
  }

  async deleteNote(noteId: NoteId): Promise<void> {
    const existing = await this.requireNote(noteId)
    const opId = this.createOperationId()
    const deletedAt = this.clock()
    const deletedNote: LocalNote = {
      ...existing,
      deletedAt,
      updatedAt: deletedAt,
      localRevision: existing.localRevision + 1,
      syncStatus: 'dirty',
      lastOpId: opId,
    }
    const op = this.createOperation('note.delete', deletedNote, opId)

    await this.persistNoteWithOp(deletedNote, op)
    this.unlockedSessions.delete(noteId)
    await this.emitAutomationEvent({ type: 'note.deleted', noteId })
    await this.invalidateNote(noteId, ['trash', 'folders'])
  }

  async restoreNote(noteId: NoteId): Promise<void> {
    const existing = await this.requireNote(noteId)
    const now = this.clock()
    const opId = this.createOperationId()
    const restoredNote: LocalNote = {
      ...existing,
      deletedAt: null,
      updatedAt: now,
      localRevision: existing.localRevision + 1,
      syncStatus: 'dirty',
      lastOpId: opId,
    }
    const op = this.createOperation('note.update', restoredNote, opId)

    await this.persistNoteWithOp(restoredNote, op)
    await this.emitAutomationEvent({
      type: 'note.updated',
      noteId,
      changedFields: ['deletedAt'],
    })
    await this.invalidateNote(noteId, ['trash', 'folders'])
  }

  async purgeNote(noteId: NoteId): Promise<void> {
    await this.localStore.hardDeleteNote(noteId)
    // Purge is local cleanup only; the remote side keeps the tombstone written by note.delete.
    this.unlockedSessions.delete(noteId)
    await this.invalidateNote(noteId, ['trash', 'folders'])
  }

  async lockNote(
    noteId: NoteId,
    credentials: Parameters<NoteRepository['lockNote']>[1],
  ): Promise<LockNoteResult> {
    const parsedCredentials = lockCredentialsSchema.parse(credentials)
    const existing = await this.requireNote(noteId)
    const plaintextNote = assertPlaintextNote(
      existing.isLocked ? this.requireUnlockedSession(noteId, existing) : existing,
    )
    const now = this.clock()
    const opId = this.createOperationId()
    const profile = await this.localStore.getCryptoProfile(this.userId)
    const resolvedMasterKey = await this.keyring.resolveMasterKeyForLock({
      credentials: parsedCredentials,
      now,
      profile,
      userId: this.userId,
    })
    const noteToEncrypt: PlaintextLocalNote = {
      ...plaintextNote,
      updatedAt: now,
      localRevision: plaintextNote.localRevision + 1,
      syncStatus: 'dirty',
      lastOpId: opId,
    }
    const encryptedNote = await this.encryptPlaintextNote(
      noteToEncrypt,
      existing,
      opId,
      'dirty',
      resolvedMasterKey.masterKey,
    )
    const op = this.createOperation('note.lock', encryptedNote, opId)

    if (resolvedMasterKey.createdProfile) {
      await this.localStore.setCryptoProfile(resolvedMasterKey.profile)
    }

    await this.localStore.putNoteWithOpReplacingNoteOps(encryptedNote, op)
    this.unlockedSessions.delete(noteId)
    await this.emitAutomationEvent({ type: 'note.locked', noteId })
    await this.invalidateNote(noteId)

    return { recoveryKey: resolvedMasterKey.recoveryKey }
  }

  async unlockNoteForSession(
    noteId: NoteId,
    credentials: Parameters<NoteRepository['unlockNoteForSession']>[1],
  ): Promise<UnlockedNoteSession> {
    const parsedCredentials = unlockCredentialsSchema.parse(credentials)
    const existing = await this.requireNote(noteId)

    if (!existing.isLocked) {
      const session = this.storeUnlockedSession(existing)
      await this.invalidateNote(noteId)
      return session
    }

    const profile = await this.localStore.getCryptoProfile(this.userId)

    if (!profile) {
      throw new Error('Crypto profile is missing for this user.')
    }

    const masterKey = await this.keyring.unlockMasterKey({
      credentials: parsedCredentials,
      profile,
      userId: this.userId,
    })
    const plaintextNote = await this.decryptEncryptedNote(existing, masterKey)
    const session = this.storeUnlockedSession(plaintextNote)

    await this.emitAutomationEvent({ type: 'note.unlocked', noteId })
    await this.invalidateNote(noteId)
    return session
  }

  async readBackupData(): Promise<NoteBackupData> {
    const [cryptoProfile, folders, notes] = await Promise.all([
      this.localStore.getCryptoProfile(this.userId),
      this.localStore.listFolders(),
      this.localStore.listAllNotes(),
    ])

    return { cryptoProfile, folders, notes }
  }

  /**
   * Merges a backup into the live library.
   *
   * Restoring is additive on purpose: a backup is usually opened after
   * something went wrong, and silently overwriting a note that is newer than
   * the file would turn a recovery into a second loss. Existing ids are
   * reported as skipped instead.
   */
  async restoreBackupData(data: NoteBackupData): Promise<NoteBackupRestoreReport> {
    const report: NoteBackupRestoreReport = {
      cryptoProfileRestored: false,
      foldersAdded: 0,
      foldersSkipped: 0,
      notesAdded: 0,
      notesSkipped: 0,
    }

    // Without the profile, restored locked notes would be undecryptable, so it
    // is written first — but never over an existing one, which would strand
    // every note already encrypted on this device.
    if (data.cryptoProfile && !(await this.localStore.getCryptoProfile(this.userId))) {
      await this.localStore.setCryptoProfile({
        ...data.cryptoProfile,
        userId: this.userId,
      })
      report.cryptoProfileRestored = true
    }

    const existingFolderIds = new Set(
      (await this.localStore.listFolders()).map((folder) => folder.id),
    )

    for (const folder of data.folders) {
      if (existingFolderIds.has(folder.id)) {
        report.foldersSkipped += 1
        continue
      }

      await this.localStore.putFolder({ ...folder, userId: this.userId })
      report.foldersAdded += 1
    }

    const existingNoteIds = new Set(
      (await this.localStore.listAllNotes()).map((note) => note.id),
    )

    for (const note of data.notes) {
      if (existingNoteIds.has(note.id)) {
        report.notesSkipped += 1
        continue
      }

      await this.localStore.putNote({
        ...note,
        userId: this.userId,
        // The restored copy is local-only until sync sees it.
        syncStatus: 'dirty',
      } as LocalNote)
      report.notesAdded += 1
    }

    await this.liveQueries.invalidate(['notes', 'trash', 'folders'])
    return report
  }

  /**
   * A note's retained edit history, newest first, read out of the operations
   * the outbox already stores. Locked snapshots list without title or preview.
   */
  async listNoteVersions(noteId: NoteId): Promise<NoteVersion[]> {
    const parsedNoteId = noteIdSchema.parse(noteId)
    const [ops, current] = await Promise.all([
      this.localStore.listNoteOps(parsedNoteId),
      this.localStore.getNote(parsedNoteId),
    ])

    return ops.map((op) => {
      const snapshot = readOperationSnapshot(op)

      return noteVersionSchema.parse({
        opId: op.opId,
        noteId: parsedNoteId,
        createdAt: op.createdAt,
        changeType: op.type,
        title: snapshot?.isLocked === false ? snapshot.title : null,
        preview: snapshot?.isLocked === false ? snapshot.preview : null,
        isLocked: snapshot?.isLocked ?? false,
        isCurrent: current?.lastOpId === op.opId,
      })
    })
  }

  /**
   * Rewinds a note to a retained version by writing that snapshot back as a
   * new revision, so the restore is itself an entry in the history and can be
   * undone. Encrypted snapshots are written back as ciphertext: their data key
   * is wrapped by the same master key, so no unlock is needed to restore one.
   */
  async restoreNoteVersion(noteId: NoteId, opId: string): Promise<void> {
    const parsedNoteId = noteIdSchema.parse(noteId)
    const ops = await this.localStore.listNoteOps(parsedNoteId)
    const op = ops.find((candidate) => candidate.opId === opId)

    if (!op) {
      throw new Error(`Version ${opId} is no longer available for note ${parsedNoteId}.`)
    }

    const snapshot = readOperationSnapshot(op)

    if (!snapshot) {
      throw new Error(`Version ${opId} does not carry a restorable snapshot.`)
    }

    const existing = await this.requireNote(parsedNoteId)
    const restoreOpId = this.createOperationId()
    const now = this.clock()
    // Content comes from the snapshot; identity, placement and sync bookkeeping
    // stay with the live row so a restore cannot resurrect a deleted note or
    // rewind the note past a revision the server already knows about.
    const restored = {
      ...snapshot,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
      deletedAt: existing.deletedAt,
      parentFolderId: existing.parentFolderId,
      remoteRevision: existing.remoteRevision,
      baseRemoteRevision: existing.baseRemoteRevision,
      deviceId: this.deviceId,
      updatedAt: now,
      localRevision: existing.localRevision + 1,
      syncStatus: 'dirty' as const,
      lastOpId: restoreOpId,
    } as LocalNote
    const restoreOp = this.createOperation('note.update', restored, restoreOpId)

    await this.persistNoteWithOp(restored, restoreOp)
    // The cached plaintext belongs to the revision we just replaced.
    this.unlockedSessions.delete(parsedNoteId)
    await this.emitAutomationEvent({
      type: 'note.updated',
      noteId: parsedNoteId,
      changedFields: ['document', 'title'],
    })
    await this.invalidateNote(parsedNoteId)
  }

  getPendingOps(limit: number) {
    return this.localStore.listPendingOps(limit)
  }

  async getLastServerRevision(): Promise<number> {
    const revision = await this.localStore.getSyncState('notes:last_server_revision')
    return revision ? Number(revision) : 0
  }

  async markOpSynced(opId: string, remoteRevision: number) {
    await this.localStore.markOpSynced(opId)
    await this.setLastServerRevision(remoteRevision)
  }

  markOpFailed(opId: string, error: string) {
    return this.localStore.markOpFailed(opId, error)
  }

  async setLastServerRevision(remoteRevision: number): Promise<void> {
    const currentRevision = await this.getLastServerRevision()
    const nextRevision = Math.max(currentRevision, remoteRevision)
    await this.localStore.setSyncState('notes:last_server_revision', String(nextRevision))
  }

  async applyRemoteChange(change: Parameters<NoteRepository['applyRemoteChange']>[0]) {
    this.unlockedSessions.delete(change.noteId)
    await this.localStore.putNote(mapRemoteChangeToLocalNote(change))
    await this.invalidateNote(change.noteId, ['trash', 'folders'])
  }

  async markConflict(
    noteId: NoteId,
    conflict: ConflictRecord,
    remoteChange?: Parameters<NoteRepository['markConflict']>[2],
  ): Promise<void> {
    const existing = await this.requireNote(noteId)
    await this.localStore.putNote({
      ...existing,
      syncStatus: 'conflict',
    })

    if (remoteChange) {
      await this.localStore.putNote(this.createConflictCopy(remoteChange, conflict))
    }

    await this.emitAutomationEvent({ type: 'sync.conflict', noteId })
    await this.invalidateNote(noteId, ['trash', 'folders'])
  }

  private createConflictCopy(
    change: Parameters<NoteRepository['applyRemoteChange']>[0],
    conflict: ConflictRecord,
  ): LocalNote {
    const remoteNote = mapRemoteChangeToLocalNote(change)
    const noteId = noteIdSchema.parse(this.idFactory('note'))
    const baseCopy = {
      ...remoteNote,
      id: noteId,
      deviceId: this.deviceId,
      createdAt: conflict.detectedAt,
      updatedAt: conflict.detectedAt,
      deletedAt: null,
      localRevision: 0,
      remoteRevision: null,
      baseRemoteRevision: null,
      syncStatus: 'synced' as const,
      lastOpId: null,
    }

    if (baseCopy.isLocked) {
      return baseCopy
    }

    return {
      ...baseCopy,
      title: `${baseCopy.title} (Conflict copy)`,
    }
  }

  private async getVisibleNote(noteId: NoteId): Promise<LocalNote | null> {
    const note = await this.localStore.getNote(noteId)

    if (!note?.isLocked) {
      return note
    }

    return this.getUnlockedSession(noteId)?.note ?? note
  }

  private async getVisibleNoteList(): Promise<NoteListItem[]> {
    const notes = await this.localStore.listNotes()

    return notes.map((note) => {
      const session = this.getUnlockedSession(note.id)
      return session ? toPlaintextListItem(session.note) : note
    })
  }

  private async getVisibleTrashList(): Promise<NoteListItem[]> {
    const notes = await this.localStore.listDeletedNotes()

    return notes.map((note) => {
      const session = this.getUnlockedSession(note.id)
      return session ? toPlaintextListItem(session.note) : note
    })
  }

  private getUnlockedSession(
    noteId: NoteId,
  ): { expiresAt: string; note: PlaintextLocalNote } | null {
    const session = this.unlockedSessions.get(noteId)

    if (!session) {
      return null
    }

    if (Date.parse(session.expiresAt) <= Date.parse(this.clock())) {
      this.unlockedSessions.delete(noteId)
      return null
    }

    return session
  }

  private requireUnlockedSession(
    noteId: NoteId,
    lockedNote: EncryptedLocalNote,
  ): PlaintextLocalNote {
    const session = this.getUnlockedSession(noteId)

    if (!session) {
      throw new Error('Locked notes require an active unlock session before editing.')
    }

    if (session.note.localRevision !== lockedNote.localRevision) {
      throw new Error('Unlocked note session is stale.')
    }

    return session.note
  }

  private storeUnlockedSession(note: PlaintextLocalNote): UnlockedNoteSession {
    const expiresAt = new Date(
      Date.parse(this.clock()) + unlockedSessionDurationMs,
    ).toISOString()
    this.unlockedSessions.set(note.id, {
      expiresAt,
      note,
    })

    return {
      noteId: note.id,
      expiresAt,
    }
  }

  private createLockedPayload(note: PlaintextLocalNote): LockedNotePayload {
    return lockedNotePayloadSchema.parse({
      version: 1,
      title: note.title,
      preview: note.preview,
      document: note.document,
      properties: note.properties ?? { status: 'none', tags: [] },
    })
  }

  private async requireCachedMasterKey(masterKey?: CryptoKey): Promise<CryptoKey> {
    if (masterKey) {
      return masterKey
    }

    const profile = await this.localStore.getCryptoProfile(this.userId)

    if (!profile) {
      throw new Error('Crypto profile is missing for this user.')
    }

    return this.keyring.unlockMasterKey({
      credentials: {
        localPin: 'session',
      },
      profile,
      userId: this.userId,
    })
  }

  private async encryptPlaintextNote(
    note: PlaintextLocalNote,
    persistedNote: LocalNote,
    opId: OperationId,
    syncStatus: LocalNote['syncStatus'],
    masterKey?: CryptoKey,
  ): Promise<EncryptedLocalNote> {
    const activeMasterKey = await this.requireCachedMasterKey(masterKey)
    const encrypted = await this.cryptoService.encryptNotePayload(
      JSON.stringify(this.createLockedPayload(note)),
      activeMasterKey,
    )

    return encryptedLocalNoteSchema.parse({
      ...persistedNote,
      title: null,
      preview: null,
      isLocked: true,
      document: null,
      encryptedPayload: encrypted.encryptedPayload,
      encryption: encrypted.encryption,
      updatedAt: note.updatedAt,
      deletedAt: note.deletedAt,
      parentFolderId: note.parentFolderId,
      localRevision: note.localRevision,
      remoteRevision: note.remoteRevision,
      baseRemoteRevision: note.baseRemoteRevision,
      syncStatus,
      lastOpId: opId,
    })
  }

  private async decryptEncryptedNote(
    note: EncryptedLocalNote,
    masterKey: CryptoKey,
  ): Promise<PlaintextLocalNote> {
    const payload = lockedNotePayloadSchema.parse(
      JSON.parse(
        await this.cryptoService.decryptNotePayload(
          note.encryptedPayload,
          note.encryption,
          masterKey,
        ),
      ),
    )

    return plaintextLocalNoteSchema.parse({
      ...note,
      title: payload.title,
      preview: payload.preview,
      isLocked: false,
      document: payload.document,
      properties: payload.properties,
      encryptedPayload: null,
      encryption: null,
    })
  }

  private async filterNoteList(
    notes: NoteListItem[],
    query: NoteListQuery,
    folders: LocalFolder[],
  ): Promise<NoteListItem[]> {
    let filteredNotes = notes

    if (query.folderId !== undefined) {
      const knownFolderIds = new Set(folders.map((folder) => folder.id))
      filteredNotes = filteredNotes.filter(
        (note) =>
          note.parentFolderId === query.folderId ||
          (query.folderId === null &&
            note.parentFolderId !== null &&
            !knownFolderIds.has(note.parentFolderId)),
      )
    }

    const search = query.search?.trim()

    if (!search) {
      return filteredNotes
    }

    // The store matches whole note bodies; the session set covers notes that
    // are only readable in memory right now, whose stored row is ciphertext.
    const matched = new Set<NoteId>(await this.localStore.searchNoteIds(search))

    for (const noteId of this.matchUnlockedSessions(search)) {
      matched.add(noteId)
    }

    return filteredNotes.filter((note) => matched.has(note.id))
  }

  /** Ids of unlocked-session notes matching `search`, using in-memory plaintext. */
  private matchUnlockedSessions(search: string): NoteId[] {
    const normalizedSearch = search.toLocaleLowerCase()
    const matched: NoteId[] = []

    for (const noteId of this.unlockedSessions.keys()) {
      const session = this.getUnlockedSession(noteId)

      if (!session) {
        continue
      }

      const { note } = session
      const matches =
        note.title.toLocaleLowerCase().includes(normalizedSearch) ||
        createNoteSearchText(note.document).includes(normalizedSearch) ||
        (note.properties?.tags.some((tag) =>
          tag.toLocaleLowerCase().includes(normalizedSearch),
        ) ??
          false)

      if (matches) {
        matched.push(noteId)
      }
    }

    return matched
  }

  private async requireFolder(folderId: FolderId): Promise<LocalFolder> {
    const folder = (await this.localStore.listFolders()).find(
      (candidate) => candidate.id === folderId,
    )

    if (!folder) {
      throw new Error(`Folder ${folderId} does not exist.`)
    }

    return folder
  }

  private async requireNote(noteId: NoteId): Promise<LocalNote> {
    const note = await this.localStore.getNote(noteId)

    if (!note) {
      throw new Error(`Note ${noteId} does not exist.`)
    }

    return note
  }

  private async emitAutomationEvent(event: AutomationEvent): Promise<void> {
    await this.automationEvents?.emit(event)
  }

  private createOperationId(): OperationId {
    return operationIdSchema.parse(this.idFactory('op'))
  }

  private createOperation(
    type: SyncOperationType,
    note: LocalNote,
    opId: OperationId,
  ): SyncOperation {
    return {
      opId,
      noteId: note.id,
      userId: this.userId,
      deviceId: this.deviceId,
      type,
      payload: mapLocalNoteToSyncPayload(note),
      baseRemoteRevision: note.baseRemoteRevision,
      createdAt: note.updatedAt,
      attemptCount: 0,
      lastError: null,
      status: 'pending',
    }
  }

  /**
   * Every note write changes the note itself and its row in any note list.
   * Callers add `trash`/`folders` when the write also crossed one of those.
   */
  private invalidateNote(
    noteId: NoteId,
    extraTags: readonly LiveQueryTag[] = [],
  ): Promise<void> {
    return this.liveQueries.invalidate(['notes', `note:${noteId}`, ...extraTags])
  }

  /**
   * Every op-producing write goes through here so history retention cannot be
   * forgotten at a new call site.
   */
  private async persistNoteWithOp(note: LocalNote, op: SyncOperation): Promise<void> {
    await this.localStore.putNoteWithOp(note, op)
    await this.pruneNoteHistory(note.id)
  }

  /**
   * Thins a note's retained history once enough writes have piled up. Without
   * this the outbox grows by a full note snapshot on every autosave and is
   * never reclaimed in a local-only install, where operations never drain.
   */
  private async pruneNoteHistory(noteId: NoteId): Promise<void> {
    const writes = (this.writesSincePrune.get(noteId) ?? 0) + 1

    if (writes < this.historyPruneEveryWrites) {
      this.writesSincePrune.set(noteId, writes)
      return
    }

    this.writesSincePrune.set(noteId, 0)
    const ops = await this.localStore.listNoteOpSummaries(noteId)
    const expired = selectExpiredNoteOps(ops, this.clock(), this.historyRetention)

    if (expired.length > 0) {
      await this.localStore.deleteOps(expired)
    }
  }
}

export function createRepositoryNotConfiguredError(): Error {
  return new Error('NoteRepository is not configured yet. Provide a LocalNotesStore.')
}

export function createUnavailableNoteRepository(): NoteRepository {
  const fail = () => Promise.reject(createRepositoryNotConfiguredError())

  const inert = <TValue>(value: TValue) => () => ({
    dispose: () => undefined,
    retain: () => undefined,
    getSnapshot: () => value,
    subscribe: () => () => undefined,
  })

  return {
    liveNote: inert(null),
    liveNoteList: inert([]),
    liveTrashList: inert([]),
    liveFolderTree: inert([]),
    listNoteVersions: () => Promise.resolve([]),
    restoreNoteVersion: fail,
    readBackupData: fail,
    restoreBackupData: fail,
    applyRemoteChange: fail,
    createFolder: fail,
    createNote: fail,
    deleteFolder: fail,
    deleteNote: fail,
    getLastServerRevision: () => Promise.resolve(0),
    getNote: () => Promise.resolve(null),
    getPendingOps: () => Promise.resolve([]),
    lockNote: fail,
    markConflict: fail,
    markOpFailed: fail,
    markOpSynced: fail,
    moveFolder: fail,
    moveNoteToFolder: fail,
    purgeNote: fail,
    renameFolder: fail,
    restoreNote: fail,
    setLastServerRevision: fail,
    unlockNoteForSession: fail,
    updateNote: fail,
  }
}
