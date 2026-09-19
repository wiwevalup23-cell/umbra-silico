import 'fake-indexeddb/auto'

import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { createDexieDatabase } from '@/local-store/dexie/dexie-db'
import { DexieNotesStore } from '@/local-store/dexie/dexie-notes-store'
import { DefaultNoteRepository } from '@/repository'
import { mapLocalNoteToSyncPayload } from '@/repository/mappers/local-note-mapper'
import { createAutomationEventBus } from '@/automation'
import {
  createDraftLocalNote,
  deviceIdSchema,
  documentV1Contract,
  folderIdSchema,
  noteIdSchema,
  operationIdSchema,
  userIdSchema,
} from '@/shared/contracts'

const userId = userIdSchema.parse('repo_user')
const deviceId = deviceIdSchema.parse('repo_device')

function createDeterministicIdFactory() {
  let folderCount = 0
  let noteCount = 0
  let opCount = 0

  return (prefix: 'folder' | 'note' | 'op') => {
    if (prefix === 'folder') {
      folderCount += 1
      return `folder_repo_${folderCount}`
    }

    if (prefix === 'note') {
      noteCount += 1
      return `note_repo_${noteCount}`
    }

    opCount += 1
    return `op_repo_${opCount}`
  }
}

function createRepositoryHarness({
  enableAutomationEvents = false,
}: {
  enableAutomationEvents?: boolean
} = {}) {
  const databaseName = `repo_contract_${crypto.randomUUID()}`
  const database = createDexieDatabase(databaseName)
  const store = new DexieNotesStore({ database })
  let tick = 0
  const repository = new DefaultNoteRepository({
    automationEvents: enableAutomationEvents
      ? createAutomationEventBus({
          localStore: store,
          userId,
          idFactory: () => `automation_event_${crypto.randomUUID()}`,
          clock: () => new Date(Date.UTC(2026, 6, 3, 0, 10, tick)).toISOString(),
        })
      : undefined,
    localStore: store,
    userId,
    deviceId,
    idFactory: createDeterministicIdFactory(),
    clock: () => {
      tick += 1
      return new Date(Date.UTC(2026, 6, 3, 0, 0, tick)).toISOString()
    },
  })

  return {
    database,
    repository,
    store,
    async cleanup() {
      database.close()
      await Dexie.delete(databaseName)
    },
  }
}

const cleanupTasks: Array<() => Promise<void>> = []

function createDocument(text: string) {
  return {
    ...documentV1Contract.createEmpty(),
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text }],
        },
      ],
    },
  }
}

async function waitForSnapshot<TValue>(
  read: () => TValue,
  predicate: (value: TValue) => boolean,
): Promise<TValue> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const value = read()

    if (predicate(value)) {
      return value
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
  }

  throw new Error('Timed out waiting for live query snapshot.')
}

afterEach(async () => {
  while (cleanupTasks.length > 0) {
    await cleanupTasks.pop()?.()
  }
})

describe('DefaultNoteRepository', () => {
  it('creates, reads, updates and soft deletes notes through repository live queries', async () => {
    const { cleanup, repository } = createRepositoryHarness()
    cleanupTasks.push(cleanup)

    const listQuery = repository.liveNoteList()
    const listEvents: number[] = []
    listQuery.subscribe(() => {
      listEvents.push(listQuery.getSnapshot().length)
    })

    const noteId = await repository.createNote({
      title: 'Repository note',
      document: {
        ...documentV1Contract.createEmpty(),
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'First body' }],
            },
          ],
        },
      },
    })
    const noteQuery = repository.liveNote(noteId)

    expect(listQuery.getSnapshot()).toHaveLength(1)
    expect(listQuery.getSnapshot()[0]).toMatchObject({
      id: noteId,
      title: 'Repository note',
      preview: 'First body',
    })
    const createdSnapshot = await waitForSnapshot(
      () => noteQuery.getSnapshot(),
      (snapshot) => snapshot !== null,
    )

    expect(createdSnapshot).toMatchObject({
      id: noteId,
      isLocked: false,
      title: 'Repository note',
    })

    await repository.updateNote(noteId, {
      title: 'Updated repository note',
      document: {
        ...documentV1Contract.createEmpty(),
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Updated body' }],
            },
          ],
        },
      },
    })

    expect(noteQuery.getSnapshot()).toMatchObject({
      title: 'Updated repository note',
      preview: 'Updated body',
      localRevision: 2,
    })

    await repository.deleteNote(noteId)

    expect(listQuery.getSnapshot()).toEqual([])
    expect(noteQuery.getSnapshot()).toMatchObject({
      deletedAt: expect.any(String) as string,
      syncStatus: 'dirty',
    })
    expect(listEvents.length).toBeGreaterThanOrEqual(3)
  })

  it('creates outbox operations inside repository methods', async () => {
    const { cleanup, repository } = createRepositoryHarness()
    cleanupTasks.push(cleanup)

    const noteId = await repository.createNote({ title: 'Outbox note' })
    await repository.updateNote(noteId, { title: 'Outbox note updated' })
    await repository.deleteNote(noteId)

    const pendingOps = await repository.getPendingOps(10)

    expect(pendingOps.map((op) => op.type)).toEqual([
      'note.create',
      'note.update',
      'note.delete',
    ])
    expect(pendingOps.every((op) => op.noteId === noteId)).toBe(true)
    expect(pendingOps.every((op) => op.status === 'pending')).toBe(true)
  })

  it('moves deleted notes through trash, restore and local purge', async () => {
    const { cleanup, repository } = createRepositoryHarness()
    cleanupTasks.push(cleanup)

    const listQuery = repository.liveNoteList()
    const trashQuery = repository.liveTrashList()
    const noteId = await repository.createNote({ title: 'Trash candidate' })

    expect(listQuery.getSnapshot().map((note) => note.id)).toEqual([noteId])
    expect(trashQuery.getSnapshot()).toEqual([])

    await repository.deleteNote(noteId)

    expect(listQuery.getSnapshot()).toEqual([])
    expect(trashQuery.getSnapshot()).toMatchObject([
      {
        id: noteId,
        title: 'Trash candidate',
      },
    ])

    await repository.restoreNote(noteId)

    expect(listQuery.getSnapshot()).toMatchObject([
      {
        id: noteId,
        title: 'Trash candidate',
      },
    ])
    expect(trashQuery.getSnapshot()).toEqual([])

    await repository.deleteNote(noteId)
    await repository.purgeNote(noteId)

    expect(listQuery.getSnapshot()).toEqual([])
    expect(trashQuery.getSnapshot()).toEqual([])
    expect(await repository.getNote(noteId)).toBeNull()
    expect((await repository.getPendingOps(10)).map((op) => op.type)).toEqual([
      'note.create',
      'note.delete',
      'note.update',
      'note.delete',
    ])
  })

  it('creates folder trees, moves notes and prevents folder cycles', async () => {
    const { cleanup, repository } = createRepositoryHarness()
    cleanupTasks.push(cleanup)

    const parentId = await repository.createFolder({ name: 'Projects' })
    const childId = await repository.createFolder({
      name: 'Drafts',
      parentFolderId: parentId,
    })
    const noteId = await repository.createNote({
      parentFolderId: parentId,
      title: 'Folder note',
    })
    const rootList = repository.liveNoteList({ folderId: null })
    const parentList = repository.liveNoteList({ folderId: parentId })
    const treeQuery = repository.liveFolderTree()
    const parentSnapshot = await waitForSnapshot(
      () => parentList.getSnapshot(),
      (snapshot) => snapshot.length === 1,
    )
    const treeSnapshot = await waitForSnapshot(
      () => treeQuery.getSnapshot(),
      (snapshot) => snapshot.length === 1,
    )

    expect(rootList.getSnapshot()).toEqual([])
    expect(parentSnapshot.map((note) => note.id)).toEqual([noteId])
    expect(treeSnapshot).toMatchObject([
      {
        folder: { id: parentId, name: 'Projects' },
        noteCount: 1,
        children: [
          {
            folder: { id: childId, name: 'Drafts', parentFolderId: parentId },
          },
        ],
      },
    ])

    await repository.moveNoteToFolder(noteId, childId)
    const childList = repository.liveNoteList({ folderId: childId })
    const childSnapshot = await waitForSnapshot(
      () => childList.getSnapshot(),
      (snapshot) => snapshot.length === 1,
    )

    expect(parentList.getSnapshot()).toEqual([])
    expect(childSnapshot).toMatchObject([
      { id: noteId, parentFolderId: childId },
    ])

    await expect(repository.moveFolder(parentId, childId)).rejects.toThrow('Cannot move')
  })

  it('searches all folder levels globally while retaining a distinct unfiled collection', async () => {
    const { cleanup, repository } = createRepositoryHarness()
    cleanupTasks.push(cleanup)
    const parent = await repository.createFolder({ name: 'Проекты' })
    const child = await repository.createFolder({ name: 'Черновики', parentFolderId: parent })
    const rootNote = await repository.createNote({ title: 'Корневая', document: createDocument('янтарь') })
    const parentNote = await repository.createNote({ parentFolderId: parent, title: 'Родительская', document: createDocument('янтарь') })
    const childNote = await repository.createNote({ parentFolderId: child, title: 'Вложенная', document: createDocument('янтарь') })
    const all = repository.liveNoteList({ folderId: undefined, search: 'янтарь' })
    const unfiled = repository.liveNoteList({ folderId: null, search: 'янтарь' })
    const scoped = repository.liveNoteList({ folderId: child, search: 'янтарь' })
    try {
      const allNotes = await waitForSnapshot(() => all.getSnapshot(), (notes) => notes.length === 3)
      expect(allNotes.map((note) => note.id).sort()).toEqual([rootNote, parentNote, childNote].sort())
      const unfiledNotes = await waitForSnapshot(() => unfiled.getSnapshot(), (notes) => notes.length === 1)
      expect(unfiledNotes.map((note) => note.id)).toEqual([rootNote])
      const scopedNotes = await waitForSnapshot(() => scoped.getSnapshot(), (notes) => notes.length === 1)
      expect(scopedNotes.map((note) => note.id)).toEqual([childNote])
      await repository.moveNoteToFolder(rootNote, child)
      expect(await waitForSnapshot(() => unfiled.getSnapshot(), (notes) => notes.length === 0)).toEqual([])
      expect(all.getSnapshot()).toHaveLength(3)
    } finally {
      all.dispose(); unfiled.dispose(); scoped.dispose()
    }
  })

  it('deletes folders by lifting direct notes and child folders to the parent', async () => {
    const { cleanup, repository } = createRepositoryHarness()
    cleanupTasks.push(cleanup)

    const parentId = await repository.createFolder({ name: 'Archive' })
    const childId = await repository.createFolder({ name: 'Child', parentFolderId: parentId })
    const noteId = await repository.createNote({ parentFolderId: parentId, title: 'Lift me' })

    await repository.deleteFolder(parentId)
    const treeQuery = repository.liveFolderTree()
    const rootList = repository.liveNoteList({ folderId: null })
    const treeSnapshot = await waitForSnapshot(
      () => treeQuery.getSnapshot(),
      (snapshot) => snapshot.length === 1,
    )
    const rootSnapshot = await waitForSnapshot(
      () => rootList.getSnapshot(),
      (snapshot) => snapshot.length === 1,
    )

    expect(treeSnapshot).toMatchObject([
      {
        folder: { id: childId, parentFolderId: null },
      },
    ])
    expect(rootSnapshot).toMatchObject([
      {
        id: noteId,
        parentFolderId: null,
      },
    ])
    await expect(repository.renameFolder(folderIdSchema.parse('missing_folder'), 'Nope'))
      .rejects.toThrow('does not exist')
  })

  it('emits internal automation events for repository note actions', async () => {
    const { cleanup, repository, store } = createRepositoryHarness({
      enableAutomationEvents: true,
    })
    cleanupTasks.push(cleanup)

    const noteId = await repository.createNote({ title: 'Automation source' })
    await repository.updateNote(noteId, { title: 'Automation source updated' })
    await repository.deleteNote(noteId)

    expect((await store.listAutomationEvents(10)).map((event) => event.event)).toEqual([
      { type: 'note.created', noteId },
      { type: 'note.updated', noteId, changedFields: ['title'] },
      { type: 'note.deleted', noteId },
    ])
  })

  it('marks operations synced and failed without touching UI state', async () => {
    const { cleanup, repository } = createRepositoryHarness()
    cleanupTasks.push(cleanup)

    const noteId = await repository.createNote({ title: 'Sync status note' })
    const [op] = await repository.getPendingOps(1)

    expect(op?.noteId).toBe(noteId)

    await repository.markOpFailed(op.opId, 'network down')
    expect(await repository.getPendingOps(10)).toEqual([])

    await repository.markOpSynced(op.opId, 42)
    expect(await repository.getPendingOps(10)).toEqual([])
  })

  it('applies remote note snapshots without writing a new outbox operation', async () => {
    const { cleanup, repository } = createRepositoryHarness()
    cleanupTasks.push(cleanup)

    const noteId = await repository.createNote({ title: 'Remote base' })
    const noteQuery = repository.liveNote(noteId)
    const createdNote = await waitForSnapshot(
      () => noteQuery.getSnapshot(),
      (snapshot) => snapshot !== null,
    )

    if (!createdNote) {
      throw new Error('Expected created note snapshot.')
    }

    await repository.markOpSynced(operationIdSchema.parse('op_repo_1'), 1)
    if (createdNote.isLocked) {
      throw new Error('Expected plaintext created note snapshot.')
    }

    await repository.applyRemoteChange({
      noteId,
      serverRevision: 7,
      changedByDeviceId: deviceIdSchema.parse('remote_device'),
      payload: mapLocalNoteToSyncPayload({
        ...createdNote,
        title: 'Remote title',
        preview: 'Remote preview',
        syncStatus: 'synced',
      }),
    })

    expect(noteQuery.getSnapshot()).toMatchObject({
      title: 'Remote title',
      remoteRevision: 7,
      baseRemoteRevision: 7,
      syncStatus: 'synced',
    })
    expect(await repository.getPendingOps(10)).toEqual([])
  })

  it('strips style values off a note authored on another device', async () => {
    const { cleanup, repository, store } = createRepositoryHarness()
    cleanupTasks.push(cleanup)

    const noteId = await repository.createNote({ document: createDocument('Local copy') })
    const local = await store.getNote(noteId)

    if (!local || local.isLocked) {
      throw new Error('Expected a plaintext local note.')
    }

    // A remote peer is the one writer this device cannot vouch for, and its
    // notes never pass an editor on the way in.
    await repository.applyRemoteChange({
      noteId,
      serverRevision: 3,
      changedByDeviceId: deviceIdSchema.parse('someone_elses_device'),
      payload: mapLocalNoteToSyncPayload({
        ...local,
        syncStatus: 'synced',
        document: {
          ...documentV1Contract.createEmpty(),
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Sent from elsewhere',
                    marks: [
                      {
                        type: 'textStyle',
                        attrs: { fontFamily: 'x; background: url(https://peer.example/b)' },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      }),
    })

    const applied = JSON.stringify(await store.getNote(noteId))
    expect(applied).not.toContain('peer.example')
    expect(applied).toContain('Sent from elsewhere')
  })

  it('locks notes into encrypted local rows and outbox payloads without plaintext', async () => {
    const { cleanup, database, repository } = createRepositoryHarness()
    cleanupTasks.push(cleanup)

    const noteId = await repository.createNote({
      title: 'Secret title',
      document: createDocument('Secret body'),
      properties: { kind: 'standard', markers: [], status: 'in_progress', tags: ['classified'] },
    })
    const noteQuery = repository.liveNote(noteId)

    await repository.lockNote(noteId, {
      masterPassword: 'correct horse battery staple',
    })

    expect(noteQuery.getSnapshot()).toMatchObject({
      isLocked: true,
      title: null,
      preview: null,
      document: null,
    })

    const rawNote = await database.notes.get(noteId)
    const rawOps = await database.noteOps.toArray()
    const rawStorage = JSON.stringify({
      note: rawNote,
      ops: rawOps,
    })

    expect(rawNote).toMatchObject({
      title: null,
      preview: null,
      document: null,
      isLocked: 1,
    })
    expect(rawNote?.encryptedPayload).toEqual(expect.any(String))
    expect(rawNote?.encryption).toEqual(expect.any(String))
    expect(rawOps.map((op) => op.type)).toContain('note.lock')
    expect(rawStorage).not.toContain('Secret title')
    expect(rawStorage).not.toContain('Secret body')
    expect(rawStorage).not.toContain('classified')
    await expect(repository.updateNote(noteId, { title: 'Plain leak' })).rejects.toThrow(
      'unlock session',
    )
  })

  it('moves and lifts locked notes across folders without an unlock session', async () => {
    const { cleanup, database, repository } = createRepositoryHarness()
    cleanupTasks.push(cleanup)

    const source = await repository.createFolder({ name: 'Source' })
    const target = await repository.createFolder({ name: 'Target' })
    const noteId = await repository.createNote({
      parentFolderId: source,
      title: 'Secret in folder',
      document: createDocument('Secret body'),
    })
    await repository.lockNote(noteId, {
      masterPassword: 'correct horse battery staple',
    })

    // Metadata-only move must not require plaintext access and must keep ciphertext intact.
    await expect(repository.moveNoteToFolder(noteId, target)).resolves.toBeUndefined()

    const movedRaw = await database.notes.get(noteId)
    expect(movedRaw).toMatchObject({
      isLocked: 1,
      title: null,
      document: null,
      parentFolderId: target,
    })
    expect(movedRaw?.encryptedPayload).toEqual(expect.any(String))

    // Deleting the containing folder lifts the locked note to root, still without decryption.
    await expect(repository.deleteFolder(target)).resolves.toBeUndefined()

    const rootList = repository.liveNoteList({ folderId: null })
    const rootSnapshot = await waitForSnapshot(
      () => rootList.getSnapshot(),
      (snapshot) => snapshot.some((note) => note.id === noteId),
    )

    expect(rootSnapshot).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: noteId, isLocked: true, parentFolderId: null }),
      ]),
    )

    const liftedRaw = await database.notes.get(noteId)
    expect(liftedRaw).toMatchObject({ isLocked: 1, parentFolderId: null })
  })

  it('persists page properties and finds notes by stored tags', async () => {
    const { cleanup, repository } = createRepositoryHarness()
    cleanupTasks.push(cleanup)

    const noteId = await repository.createNote({
      title: 'Field notes',
      properties: { kind: 'standard', markers: ['idea'], status: 'draft', tags: ['Research', 'Archive'] },
    })
    const taggedQuery = repository.liveNoteList({ search: 'research' })
    const noteQuery = repository.liveNote(noteId)

    await waitForSnapshot(() => taggedQuery.getSnapshot(), (notes) => notes.length === 1)
    expect(taggedQuery.getSnapshot()[0]).toMatchObject({
      id: noteId,
      propertyMarkers: ['idea'],
      propertyStatus: 'draft',
      tags: ['Research', 'Archive'],
    })

    await repository.updateNote(noteId, {
      properties: { kind: 'standard', markers: [], status: 'completed', tags: ['Reference'] },
    })

    expect(noteQuery.getSnapshot()).toMatchObject({
      properties: { kind: 'standard', markers: [], status: 'completed', tags: ['Reference'] },
    })
    expect(taggedQuery.getSnapshot()).toEqual([])
  })

  it('unlocks notes for an in-memory session and keeps edits encrypted at rest', async () => {
    const { cleanup, database, repository } = createRepositoryHarness()
    cleanupTasks.push(cleanup)

    const noteId = await repository.createNote({
      title: 'Private title',
      document: createDocument('Private body'),
    })
    const noteQuery = repository.liveNote(noteId)
    const masterPassword = 'correct horse battery staple'

    await repository.lockNote(noteId, { masterPassword })
    await repository.unlockNoteForSession(noteId, { masterPassword })

    expect(noteQuery.getSnapshot()).toMatchObject({
      isLocked: false,
      title: 'Private title',
      preview: 'Private body',
    })

    await repository.updateNote(noteId, {
      title: 'Private title edited',
      document: createDocument('Private body edited'),
    })

    expect(noteQuery.getSnapshot()).toMatchObject({
      isLocked: false,
      title: 'Private title edited',
      preview: 'Private body edited',
    })

    const rawNote = await database.notes.get(noteId)
    const rawOps = await database.noteOps.toArray()
    const rawStorage = JSON.stringify({
      note: rawNote,
      ops: rawOps,
    })

    expect(rawNote).toMatchObject({
      title: null,
      preview: null,
      document: null,
      isLocked: 1,
    })
    expect(rawOps.map((op) => op.type)).toContain('note.update')
    expect(rawStorage).not.toContain('Private title edited')
    expect(rawStorage).not.toContain('Private body edited')
  })

  it('marks conflicts through repository and refreshes live note queries', async () => {
    const { cleanup, repository } = createRepositoryHarness()
    cleanupTasks.push(cleanup)

    const noteId = await repository.createNote({ title: 'Conflict note' })
    const listQuery = repository.liveNoteList()
    const noteQuery = repository.liveNote(noteId)
    const createdNote = await waitForSnapshot(
      () => noteQuery.getSnapshot(),
      (snapshot) => snapshot !== null,
    )

    if (!createdNote || createdNote.isLocked) {
      throw new Error('Expected plaintext conflict note snapshot.')
    }

    const conflictRecord = {
      noteId,
      localRevision: 1,
      remoteRevision: 2,
      detectedAt: '2026-07-03T00:05:00.000Z',
    }

    await repository.markConflict(noteId, conflictRecord, {
      noteId,
      serverRevision: 2,
      changedByDeviceId: deviceIdSchema.parse('remote_device'),
      payload: mapLocalNoteToSyncPayload({
        ...createdNote,
        title: 'Remote conflict',
        preview: 'Remote preserved text',
        syncStatus: 'synced',
      }),
    })

    expect(noteQuery.getSnapshot()).toMatchObject({
      syncStatus: 'conflict',
    })

    const listSnapshot = await waitForSnapshot(
      () => listQuery.getSnapshot(),
      (snapshot) => snapshot.some((note) => note.title === 'Remote conflict (Conflict copy)'),
    )
    const conflictCopy = listSnapshot.find(
      (note) => note.title === 'Remote conflict (Conflict copy)',
    )

    expect(conflictCopy).toMatchObject({
      preview: 'Remote preserved text',
      syncStatus: 'synced',
    })
    expect(await repository.getPendingOps(10)).toHaveLength(1)
  })

  it('rejects repository updates for missing notes', async () => {
    const { cleanup, repository } = createRepositoryHarness()
    cleanupTasks.push(cleanup)

    await expect(
      repository.updateNote(noteIdSchema.parse('missing_note'), {
        title: 'Nope',
      }),
    ).rejects.toThrow('does not exist')
  })

  it('derives a title from the first line when a note is created with content but no title', async () => {
    const { cleanup, repository } = createRepositoryHarness()
    cleanupTasks.push(cleanup)

    const noteId = await repository.createNote({ document: createDocument('Imported first line') })

    expect(await repository.getNote(noteId)).toMatchObject({ title: 'Imported first line' })
  })

  it('keeps an implicit title tracking the first line until a custom title is typed (1.3)', async () => {
    const { cleanup, repository } = createRepositoryHarness()
    cleanupTasks.push(cleanup)

    const noteId = await repository.createNote({})
    // A new note has no title, rather than a stored English word standing in
    // for one. What an untitled note is called is decided where it is drawn.
    expect(await repository.getNote(noteId)).toMatchObject({ title: '' })

    // Typing body text alone (no title patch) derives the title.
    await repository.updateNote(noteId, { document: createDocument('First words here') })
    expect(await repository.getNote(noteId)).toMatchObject({ title: 'First words here' })

    // It keeps following the first line across further body-only edits.
    await repository.updateNote(noteId, { document: createDocument('Different first line now') })
    expect(await repository.getNote(noteId)).toMatchObject({ title: 'Different first line now' })

    // A title typed by hand always wins and freezes auto-derivation for good.
    await repository.updateNote(noteId, { title: 'My Custom Title' })
    await repository.updateNote(noteId, { document: createDocument('Yet another line') })
    expect(await repository.getNote(noteId)).toMatchObject({ title: 'My Custom Title' })
  })

  it('lets a typed title be cleared back to none', async () => {
    const { cleanup, repository } = createRepositoryHarness()
    cleanupTasks.push(cleanup)

    const noteId = await repository.createNote({ title: 'Named by hand' })
    expect(await repository.getNote(noteId)).toMatchObject({ title: 'Named by hand' })

    // Emptying the field used to be impossible — the schema demanded at least
    // one character, so the editor wrote "Untitled" instead and the note came
    // back named after a word nobody typed.
    await repository.updateNote(noteId, { title: '' })
    expect(await repository.getNote(noteId)).toMatchObject({ title: '' })

    // And with no title of its own, the note resumes following its first line.
    await repository.updateNote(noteId, { document: createDocument('Back to the body') })
    expect(await repository.getNote(noteId)).toMatchObject({ title: 'Back to the body' })
  })

  it('replaces the stored Untitled placeholder once (2.7 migration)', async () => {
    const { cleanup, repository, store } = createRepositoryHarness()
    cleanupTasks.push(cleanup)

    const placeholder = {
      ...createDraftLocalNote({
        deviceId,
        id: noteIdSchema.parse('note_repo_untitled'),
        now: '2026-08-14T00:00:00.000Z',
        userId,
      }),
      title: 'Untitled',
    }
    const named = {
      ...createDraftLocalNote({
        deviceId,
        id: noteIdSchema.parse('note_repo_named'),
        now: '2026-08-14T00:00:01.000Z',
        userId,
      }),
      title: 'A real name',
    }

    await store.putNote(placeholder)
    await store.putNote(named)

    await repository.migrateUntitledPlaceholders()

    expect(await store.getNote(placeholder.id)).toMatchObject({ title: '' })
    // A note that carries a name of its own is left exactly as it was.
    expect(await store.getNote(named.id)).toEqual(named)

    const afterFirstRun = await store.getNote(placeholder.id)
    await repository.migrateUntitledPlaceholders()
    expect(await store.getNote(placeholder.id)).toEqual(afterFirstRun)
  })

  it('answers each write with the revision it produced', async () => {
    const { cleanup, repository } = createRepositoryHarness()
    cleanupTasks.push(cleanup)

    const noteId = await repository.createNote({})
    const created = await repository.getNote(noteId)

    // A writer keeping this number can recognise its own change coming back
    // through a live query, which is the only way to tell it from someone
    // else's: comparing documents cannot, because a delivery still in flight
    // and a delivery that is newer both differ from what the writer holds.
    const afterDocument = await repository.updateNote(noteId, {
      document: createDocument('First edit'),
    })
    expect(afterDocument).toBe((created?.localRevision ?? 0) + 1)
    expect(await repository.getNote(noteId)).toMatchObject({
      localRevision: afterDocument,
    })

    // Title and document share the one counter, so both have to report.
    const afterTitle = await repository.updateNote(noteId, { title: 'Renamed' })
    expect(afterTitle).toBe(afterDocument + 1)
    expect(await repository.getNote(noteId)).toMatchObject({ localRevision: afterTitle })
  })

  it('backfills stale preview/title text once, skips locked notes, and is idempotent (1.1/1.3 migration)', async () => {
    const { cleanup, repository, store } = createRepositoryHarness()
    cleanupTasks.push(cleanup)

    // Simulates a note written before the per-block text extraction fix: the
    // preview carries the old flat-join word damage, and the title never got
    // an implicit value even though the document has real content.
    const staleNote = {
      ...createDraftLocalNote({
        deviceId,
        id: noteIdSchema.parse('note_repo_stale'),
        now: '2026-07-03T00:00:00.000Z',
        userId,
      }),
      document: createDocument('Reproducible results'),
      preview: 'Re produc ible results',
    }
    await store.putNote(staleNote)

    const lockedNote = {
      ...createDraftLocalNote({
        deviceId,
        id: noteIdSchema.parse('note_repo_locked'),
        now: '2026-07-03T00:00:00.000Z',
        title: 'Locked note',
        userId,
      }),
      document: null,
      encryptedPayload: 'ciphertext',
      encryption: {
        algorithm: 'AES-GCM-256' as const,
        payloadNonce: 'nonce',
        version: 1 as const,
        wrapNonce: 'wrap',
        wrappedDek: 'dek',
      },
      isLocked: true as const,
      preview: null,
      title: null,
    }
    await store.putNote(lockedNote)

    await repository.migrateDocumentTextFields()

    expect(await repository.getNote(staleNote.id)).toMatchObject({
      preview: 'Reproducible results',
      title: 'Reproducible results',
    })
    // Untouched: locked fields live in the encrypted payload, fixed lazily on
    // the next unlock+save instead.
    expect(await repository.getNote(lockedNote.id)).toMatchObject({
      isLocked: true,
      preview: null,
      title: null,
    })

    // A second run must be a no-op: rewriting every note on every launch
    // would be wasted work forever on an install with nothing left to fix.
    const beforeSecondRun = await store.getNote(staleNote.id)
    await repository.migrateDocumentTextFields()
    expect(await store.getNote(staleNote.id)).toEqual(beforeSecondRun)
  })

  it('strips style values a document is not entitled to carry, whichever door it came through', async () => {
    const { cleanup, repository, store } = createRepositoryHarness()
    cleanupTasks.push(cleanup)

    // `attrs` is free-form JSON and TipTap interpolates these into a `style`
    // attribute, so a document from elsewhere can turn a note whose badge
    // reads "Local only" into a beacon the moment something renders it.
    const beacon = 'serif; background: url(https://tracker.example/beacon.png)'
    const hostileDocument = {
      ...documentV1Contract.createEmpty(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Looks ordinary',
                marks: [
                  { type: 'textStyle', attrs: { fontFamily: beacon } },
                  { type: 'highlight', attrs: { color: 'red; background-image: url(x)' } },
                ],
              },
            ],
          },
        ],
      },
    }

    // Created — templates today, any caller with ready-made content tomorrow.
    const createdId = await repository.createNote({ document: hostileDocument })
    expect(JSON.stringify(await store.getNote(createdId))).not.toContain('tracker.example')

    // Patched — the Telegram import and the automation gateway both land here.
    const patchedId = await repository.createNote({})
    await repository.updateNote(patchedId, { document: hostileDocument })
    expect(JSON.stringify(await store.getNote(patchedId))).not.toContain('tracker.example')

    // Restored from a bundle, which is a file from anywhere at all.
    const restoredId = noteIdSchema.parse('note_repo_restored')
    await repository.restoreBackupData({
      cryptoProfile: null,
      folders: [],
      notes: [
        {
          ...createDraftLocalNote({
            deviceId,
            id: restoredId,
            now: '2026-08-14T00:00:00.000Z',
            userId,
          }),
          document: hostileDocument,
        },
      ],
    })
    expect(JSON.stringify(await store.getNote(restoredId))).not.toContain('tracker.example')

    // The text and the marks themselves survive; only the value goes.
    expect(await store.getNote(createdId)).toMatchObject({ preview: 'Looks ordinary' })
  })

  it('scrubs styles already in storage once, and leaves clean notes alone (2.6 migration)', async () => {
    const { cleanup, repository, store } = createRepositoryHarness()
    cleanupTasks.push(cleanup)

    // Written straight to the store: a note that arrived before the door was
    // guarded, which is exactly what the migration exists for.
    const hostile = {
      ...createDraftLocalNote({
        deviceId,
        id: noteIdSchema.parse('note_repo_style'),
        now: '2026-08-14T00:00:00.000Z',
        userId,
      }),
      document: {
        ...documentV1Contract.createEmpty(),
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Restored long ago',
                  marks: [
                    {
                      type: 'textStyle',
                      attrs: { fontFamily: 'x; background: url(https://beacon.example/p)' },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    }
    const clean = {
      ...createDraftLocalNote({
        deviceId,
        id: noteIdSchema.parse('note_repo_style_clean'),
        now: '2026-08-14T00:00:01.000Z',
        userId,
      }),
      document: createDocument('Nothing to strip'),
    }

    await store.putNote(hostile)
    await store.putNote(clean)

    await repository.migrateDocumentStyles()

    const migrated = await store.getNote(hostile.id)
    expect(JSON.stringify(migrated)).not.toContain('beacon.example')
    expect(JSON.stringify(migrated)).toContain('Restored long ago')

    // Idempotent, and a note with nothing to strip is never rewritten.
    const afterFirstRun = await store.getNote(hostile.id)
    await repository.migrateDocumentStyles()
    expect(await store.getNote(hostile.id)).toEqual(afterFirstRun)
    expect(await store.getNote(clean.id)).toEqual(clean)
  })

  it('repoints documents off retired fonts once and leaves the rest alone (2.5 migration)', async () => {
    const { cleanup, repository, store } = createRepositoryHarness()
    cleanupTasks.push(cleanup)

    const withRetiredFont = {
      ...createDraftLocalNote({
        deviceId,
        id: noteIdSchema.parse('note_repo_font'),
        now: '2026-08-06T00:00:00.000Z',
        userId,
      }),
      document: {
        ...documentV1Contract.createEmpty(),
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Written in a face the palette no longer offers',
                  marks: [{ type: 'textStyle', attrs: { fontFamily: 'Caveat Variable' } }],
                },
              ],
            },
          ],
        },
      },
    }
    await store.putNote(withRetiredFont)

    await repository.migrateRetiredFonts()

    const migrated = await store.getNote(withRetiredFont.id)
    const serialized = JSON.stringify(migrated)
    expect(serialized).not.toContain('Caveat Variable')
    expect(serialized).toContain('SN EB Garamond')

    // Idempotent: a second launch must not rewrite every note again.
    const afterFirstRun = await store.getNote(withRetiredFont.id)
    await repository.migrateRetiredFonts()
    expect(await store.getNote(withRetiredFont.id)).toEqual(afterFirstRun)
  })
})
