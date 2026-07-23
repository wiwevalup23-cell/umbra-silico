import { z } from 'zod'
import {
  createCryptoService,
  createKeyring,
  type CryptoService,
  type Keyring,
} from '@/crypto'
import type { LocalNotesStore } from '@/local-store/contracts'
import type { NoteRepository } from '@/repository/contracts/note-repository'
import { StoreBackedLiveQuery, type RefreshableLiveQuery } from '@/repository/live-query'
import { mapLocalNoteToSyncPayload } from '@/repository/mappers/local-note-mapper'
import { mapRemoteChangeToLocalNote } from '@/repository/mappers/remote-note-mapper'
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
  noteIdSchema,
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
  type NoteDocument,
  type NoteId,
  type NoteListItem,
  type NoteListQuery,
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
}

const defaultIdFactory: RepositoryIdFactory = (prefix) =>
  `${prefix}_${globalThis.crypto.randomUUID()}`

const defaultClock: RepositoryClock = () => new Date().toISOString()
const unlockedSessionDurationMs = 15 * 60 * 1000

const lockedNotePayloadSchema = z.object({
  version: z.literal(1),
  title: z.string().min(1),
  preview: z.string(),
  document: noteDocumentSchema,
  properties: notePropertiesSchema.default({ kind: 'standard', status: 'none', tags: [] }),
})

type LockedNotePayload = z.infer<typeof lockedNotePayloadSchema>

function sameJson<TValue>(left: TValue, right: TValue): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function isTextNode(node: unknown): node is { type: 'text'; text: string } {
  return (
    node !== null &&
    typeof node === 'object' &&
    'type' in node &&
    'text' in node &&
    node.type === 'text' &&
    typeof node.text === 'string'
  )
}

function collectText(node: unknown, output: string[]): void {
  if (!node || typeof node !== 'object') {
    return
  }

  if (isTextNode(node)) {
    output.push(node.text)
    return
  }

  if (
    !('content' in node) ||
    !Array.isArray(node.content)
  ) {
    return
  }

  for (const child of node.content) {
    collectText(child, output)
  }
}

function createPreview(document: NoteDocument): string {
  const text: string[] = []
  collectText(document.content, text)
  return text.join(' ').replace(/\s+/g, ' ').trim().slice(0, 180)
}

function assertPlaintextNote(note: LocalNote): PlaintextLocalNote {
  if (note.isLocked) {
    throw new Error('Locked notes cannot be edited until the crypto phase is implemented.')
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
  private readonly liveQueries = new Set<RefreshableLiveQuery>()
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
  }

  liveNoteList(query: NoteListQuery = {}) {
    const liveQuery = new StoreBackedLiveQuery<NoteListItem[]>(
      [],
      async () =>
        this.filterNoteList(
          await this.getVisibleNoteList(),
          query,
          await this.localStore.listFolders(),
        ),
      sameJson,
    )

    this.liveQueries.add(liveQuery)
    return liveQuery
  }

  liveTrashList() {
    const liveQuery = new StoreBackedLiveQuery<NoteListItem[]>(
      [],
      () => this.getVisibleTrashList(),
      sameJson,
    )

    this.liveQueries.add(liveQuery)
    return liveQuery
  }

  liveFolderTree() {
    const liveQuery = new StoreBackedLiveQuery<FolderTreeNode[]>(
      [],
      async () =>
        buildFolderTree(await this.localStore.listFolders(), await this.localStore.listNotes()),
      sameJson,
    )

    this.liveQueries.add(liveQuery)
    return liveQuery
  }

  liveNote(noteId: NoteId) {
    const liveQuery = new StoreBackedLiveQuery<LocalNote | null>(
      null,
      () => this.getVisibleNote(noteId),
      sameJson,
    )

    this.liveQueries.add(liveQuery)
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
      preview: createPreview(note.document),
      localRevision: 1,
      lastOpId: opId,
    }
    const op = this.createOperation('note.create', noteWithOp, opId)

    await this.localStore.putNoteWithOp(noteWithOp, op)
    await this.emitAutomationEvent({ type: 'note.created', noteId })
    await this.refreshLiveQueries()

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
    await this.refreshLiveQueries()
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
    await this.refreshLiveQueries()
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
    await this.refreshLiveQueries()
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
    await this.refreshLiveQueries()
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

    await this.localStore.putNoteWithOp(reparentedNote, op)
    this.reparentUnlockedSession(noteId, folderId, now, reparentedNote.localRevision)
    await this.emitAutomationEvent({
      type: 'note.updated',
      noteId,
      changedFields: ['parentFolderId'],
    })
    await this.refreshLiveQueries()
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
      preview: createPreview(document),
      document,
      properties: parsedPatch.properties ?? plaintextNote.properties,
      updatedAt: this.clock(),
      localRevision: plaintextNote.localRevision + 1,
      syncStatus: 'dirty',
      lastOpId: opId,
    }

    if (existing.isLocked) {
      const encryptedNote = await this.encryptPlaintextNote(
        updatedNote,
        existing,
        opId,
        'dirty',
      )
      const op = this.createOperation('note.update', encryptedNote, opId)

      await this.localStore.putNoteWithOp(encryptedNote, op)
      this.storeUnlockedSession(updatedNote)
      await this.emitAutomationEvent({
        type: 'note.updated',
        noteId,
        changedFields: Object.keys(parsedPatch),
      })
      await this.refreshLiveQueries()
      return
    }

    const op = this.createOperation('note.update', updatedNote, opId)

    await this.localStore.putNoteWithOp(updatedNote, op)
    await this.emitAutomationEvent({
      type: 'note.updated',
      noteId,
      changedFields: Object.keys(parsedPatch),
    })
    await this.refreshLiveQueries()
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

    await this.localStore.putNoteWithOp(deletedNote, op)
    this.unlockedSessions.delete(noteId)
    await this.emitAutomationEvent({ type: 'note.deleted', noteId })
    await this.refreshLiveQueries()
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

    await this.localStore.putNoteWithOp(restoredNote, op)
    await this.emitAutomationEvent({
      type: 'note.updated',
      noteId,
      changedFields: ['deletedAt'],
    })
    await this.refreshLiveQueries()
  }

  async purgeNote(noteId: NoteId): Promise<void> {
    await this.localStore.hardDeleteNote(noteId)
    // Purge is local cleanup only; the remote side keeps the tombstone written by note.delete.
    this.unlockedSessions.delete(noteId)
    await this.refreshLiveQueries()
  }

  async lockNote(
    noteId: NoteId,
    credentials: Parameters<NoteRepository['lockNote']>[1],
  ): Promise<void> {
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
    await this.refreshLiveQueries()
  }

  async unlockNoteForSession(
    noteId: NoteId,
    credentials: Parameters<NoteRepository['unlockNoteForSession']>[1],
  ): Promise<UnlockedNoteSession> {
    const parsedCredentials = unlockCredentialsSchema.parse(credentials)
    const existing = await this.requireNote(noteId)

    if (!existing.isLocked) {
      const session = this.storeUnlockedSession(existing)
      await this.refreshLiveQueries()
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
    await this.refreshLiveQueries()
    return session
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
    await this.refreshLiveQueries()
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
    await this.refreshLiveQueries()
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

  private filterNoteList(
    notes: NoteListItem[],
    query: NoteListQuery,
    folders: LocalFolder[],
  ): NoteListItem[] {
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

    if (!query.search) {
      return filteredNotes
    }

    const search = query.search.toLowerCase()
    return filteredNotes.filter(
      (note) =>
        note.title.toLowerCase().includes(search) ||
        note.preview.toLowerCase().includes(search) ||
        note.tags?.some((tag) => tag.toLocaleLowerCase().includes(search)),
    )
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

  private async refreshLiveQueries(): Promise<void> {
    await Promise.all([...this.liveQueries].map((query) => query.refresh()))
  }
}

export function createRepositoryNotConfiguredError(): Error {
  return new Error('NoteRepository is not configured yet. Provide a LocalNotesStore.')
}

export function createUnavailableNoteRepository(): NoteRepository {
  const fail = () => Promise.reject(createRepositoryNotConfiguredError())

  return {
    liveNote: () => ({
      getSnapshot: () => null,
      subscribe: () => () => undefined,
    }),
    liveNoteList: () => ({
      getSnapshot: () => [],
      subscribe: () => () => undefined,
    }),
    liveTrashList: () => ({
      getSnapshot: () => [],
      subscribe: () => () => undefined,
    }),
    liveFolderTree: () => ({
      getSnapshot: () => [],
      subscribe: () => () => undefined,
    }),
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
