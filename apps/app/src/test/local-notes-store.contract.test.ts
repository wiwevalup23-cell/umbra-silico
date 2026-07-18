import 'fake-indexeddb/auto'

import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import type {
  LocalNotesStore,
  StoredAutomationEventRow,
  StoredCryptoProfileRow,
  StoredFolderRow,
  StoredNoteRow,
  StoredSyncOperationRow,
  StoredSyncStateRow,
} from '@/local-store/contracts'
import { createDexieDatabase } from '@/local-store/dexie/dexie-db'
import { DexieNotesStore } from '@/local-store/dexie/dexie-notes-store'
import type {
  SqlBindValue,
  SqlDatabase,
  SqlQueryResult,
  SqlStatement,
} from '@/local-store/sqlite/sqlite-driver'
import {
  createSqliteNotesStore,
  initializeSqliteNotesStore,
} from '@/local-store/sqlite/sqlite-notes-store'
import {
  createDraftLocalNote,
  automationEventIdSchema,
  deviceIdSchema,
  folderIdSchema,
  noteIdSchema,
  operationIdSchema,
  userIdSchema,
  type LocalNote,
  type LocalFolder,
  type NoteId,
  type PlaintextLocalNote,
  type SyncOperation,
} from '@/shared/contracts'

type StoreHarness = {
  name: string
  create(): Promise<{
    store: LocalNotesStore
    cleanup(): Promise<void>
  }>
}

const now = '2026-07-03T00:00:00.000Z'
const later = '2026-07-03T00:01:00.000Z'
const deletedAt = '2026-07-03T00:02:00.000Z'

const userId = userIdSchema.parse('user_contract')
const deviceId = deviceIdSchema.parse('device_contract')

function makeNote(id: string, title: string, updatedAt = now): PlaintextLocalNote {
  return {
    ...createDraftLocalNote({
      id: noteIdSchema.parse(id),
      userId,
      deviceId,
      now,
      title,
    }),
    preview: `${title} preview`,
    updatedAt,
  }
}

function makeFolder(
  id: string,
  name: string,
  parentFolderId: LocalFolder['parentFolderId'] = null,
  sortIndex = 0,
): LocalFolder {
  return {
    id: folderIdSchema.parse(id),
    userId,
    name,
    parentFolderId,
    sortIndex,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    localRevision: 1,
    syncStatus: 'dirty',
    deviceId,
  }
}

function makeOperation(
  opId: string,
  noteId: NoteId,
  type: SyncOperation['type'] = 'note.update',
): SyncOperation {
  return {
    opId: operationIdSchema.parse(opId),
    noteId,
    userId,
    deviceId,
    type,
    payload: {
      noteId,
      source: 'contract-test',
    },
    baseRemoteRevision: null,
    createdAt: now,
    attemptCount: 0,
    lastError: null,
    status: 'pending',
  }
}

function cloneMap<TKey, TValue>(map: Map<TKey, TValue>) {
  return new Map(
    [...map.entries()].map(([key, value]) => [
      key,
      JSON.parse(JSON.stringify(value)) as TValue,
    ]),
  )
}

class MemorySqlDatabase implements SqlDatabase {
  private automationEvents = new Map<string, StoredAutomationEventRow>()
  private notes = new Map<string, StoredNoteRow>()
  private folders = new Map<string, StoredFolderRow>()
  private noteOps = new Map<string, StoredSyncOperationRow>()
  private syncState = new Map<string, StoredSyncStateRow>()
  private cryptoProfiles = new Map<string, StoredCryptoProfileRow>()
  private transactionSnapshot: {
    automationEvents: Map<string, StoredAutomationEventRow>
    cryptoProfiles: Map<string, StoredCryptoProfileRow>
    folders: Map<string, StoredFolderRow>
    notes: Map<string, StoredNoteRow>
    noteOps: Map<string, StoredSyncOperationRow>
    syncState: Map<string, StoredSyncStateRow>
  } | null = null
  transactionCount = 0

  async executeTransaction(statements: SqlStatement[]): Promise<void> {
    this.transactionCount += 1
    await this.execute('begin immediate')
    try {
      for (const statement of statements) {
        await this.execute(statement.query, statement.bindValues)
      }
      await this.execute('commit')
    } catch (error) {
      await this.execute('rollback')
      throw error
    }
  }

  async execute(query: string, bindValues: SqlBindValue[] = []): Promise<SqlQueryResult> {
    const normalized = query.trim().toLowerCase()

    if (
      normalized.startsWith('create table') ||
      normalized.startsWith('create index') ||
      normalized.startsWith('alter table')
    ) {
      return { rowsAffected: 0 }
    }

    if (normalized === 'begin immediate') {
      this.transactionSnapshot = {
        automationEvents: cloneMap(this.automationEvents),
        cryptoProfiles: cloneMap(this.cryptoProfiles),
        folders: cloneMap(this.folders),
        notes: cloneMap(this.notes),
        noteOps: cloneMap(this.noteOps),
        syncState: cloneMap(this.syncState),
      }
      return { rowsAffected: 0 }
    }

    if (normalized === 'commit') {
      this.transactionSnapshot = null
      return { rowsAffected: 0 }
    }

    if (normalized === 'rollback') {
      if (this.transactionSnapshot) {
        this.notes = this.transactionSnapshot.notes
        this.folders = this.transactionSnapshot.folders
        this.noteOps = this.transactionSnapshot.noteOps
        this.syncState = this.transactionSnapshot.syncState
        this.cryptoProfiles = this.transactionSnapshot.cryptoProfiles
        this.automationEvents = this.transactionSnapshot.automationEvents
        this.transactionSnapshot = null
      }
      return { rowsAffected: 0 }
    }

    if (normalized.startsWith('insert into notes')) {
      const row: StoredNoteRow = {
        id: String(bindValues[0]),
        userId: String(bindValues[1]),
        schemaVersion: Number(bindValues[2]),
        title: bindValues[3] === null ? null : String(bindValues[3]),
        preview: bindValues[4] === null ? null : String(bindValues[4]),
        isLocked: Number(bindValues[5]) === 1 ? 1 : 0,
        document: bindValues[6] === null ? null : String(bindValues[6]),
        encryptedPayload: bindValues[7] === null ? null : String(bindValues[7]),
        encryption: bindValues[8] === null ? null : String(bindValues[8]),
        createdAt: String(bindValues[9]),
        updatedAt: String(bindValues[10]),
        deletedAt: bindValues[11] === null ? null : String(bindValues[11]),
        parentFolderId: bindValues[12] === null ? null : String(bindValues[12]),
        localRevision: Number(bindValues[13]),
        remoteRevision: bindValues[14] === null ? null : Number(bindValues[14]),
        baseRemoteRevision: bindValues[15] === null ? null : Number(bindValues[15]),
        syncStatus: String(bindValues[16]),
        lastOpId: bindValues[17] === null ? null : String(bindValues[17]),
        deviceId: String(bindValues[18]),
        properties: bindValues[19] === null || bindValues[19] === undefined
          ? null
          : String(bindValues[19]),
      }

      this.notes.set(row.id, row)
      return { rowsAffected: 1 }
    }

    if (normalized.startsWith('insert into folders')) {
      const row: StoredFolderRow = {
        id: String(bindValues[0]),
        userId: String(bindValues[1]),
        name: String(bindValues[2]),
        parentFolderId: bindValues[3] === null ? null : String(bindValues[3]),
        sortIndex: Number(bindValues[4]),
        createdAt: String(bindValues[5]),
        updatedAt: String(bindValues[6]),
        deletedAt: bindValues[7] === null ? null : String(bindValues[7]),
        localRevision: Number(bindValues[8]),
        syncStatus: String(bindValues[9]),
        deviceId: String(bindValues[10]),
      }

      this.folders.set(row.id, row)
      return { rowsAffected: 1 }
    }

    if (normalized.startsWith('update folders')) {
      const id = String(bindValues[2])
      const row = this.folders.get(id)

      if (!row) {
        return { rowsAffected: 0 }
      }

      this.folders.set(id, {
        ...row,
        deletedAt: String(bindValues[0]),
        updatedAt: String(bindValues[0]),
        syncStatus: String(bindValues[1]),
      })
      return { rowsAffected: 1 }
    }

    if (normalized.startsWith('update notes')) {
      const id = String(bindValues[2])
      const row = this.notes.get(id)

      if (!row) {
        return { rowsAffected: 0 }
      }

      this.notes.set(id, {
        ...row,
        deletedAt: String(bindValues[0]),
        syncStatus: String(bindValues[1]),
      })
      return { rowsAffected: 1 }
    }

    if (normalized.startsWith('insert into note_ops')) {
      const row: StoredSyncOperationRow = {
        opId: String(bindValues[0]),
        noteId: String(bindValues[1]),
        userId: String(bindValues[2]),
        deviceId: String(bindValues[3]),
        type: String(bindValues[4]),
        payload: String(bindValues[5]),
        baseRemoteRevision: bindValues[6] === null ? null : Number(bindValues[6]),
        createdAt: String(bindValues[7]),
        attemptCount: Number(bindValues[8]),
        lastError: bindValues[9] === null ? null : String(bindValues[9]),
        status: String(bindValues[10]),
      }

      if (this.noteOps.has(row.opId)) {
        throw new Error(`duplicate op ${row.opId}`)
      }

      this.noteOps.set(row.opId, row)
      return { rowsAffected: 1 }
    }

    if (normalized.startsWith('delete from note_ops')) {
      const noteId = String(bindValues[0])
      let rowsAffected = 0

      for (const [opId, row] of this.noteOps) {
        if (row.noteId === noteId) {
          this.noteOps.delete(opId)
          rowsAffected += 1
        }
      }

      return { rowsAffected }
    }

    if (normalized.startsWith('delete from notes')) {
      const id = String(bindValues[0])
      const rowsAffected = this.notes.delete(id) ? 1 : 0
      return { rowsAffected }
    }

    if (normalized.startsWith('update note_ops') && normalized.includes('last_error = null')) {
      const opId = String(bindValues[1])
      const row = this.noteOps.get(opId)

      if (!row) {
        return { rowsAffected: 0 }
      }

      this.noteOps.set(opId, {
        ...row,
        status: String(bindValues[0]),
        lastError: null,
      })
      return { rowsAffected: 1 }
    }

    if (normalized.startsWith('update note_ops')) {
      const opId = String(bindValues[2])
      const row = this.noteOps.get(opId)

      if (!row) {
        return { rowsAffected: 0 }
      }

      this.noteOps.set(opId, {
        ...row,
        status: String(bindValues[0]),
        lastError: String(bindValues[1]),
        attemptCount: row.attemptCount + 1,
      })
      return { rowsAffected: 1 }
    }

    if (normalized.startsWith('insert into sync_state')) {
      this.syncState.set(String(bindValues[0]), {
        key: String(bindValues[0]),
        value: String(bindValues[1]),
        updatedAt: String(bindValues[2]),
      })
      return { rowsAffected: 1 }
    }

    if (normalized.startsWith('insert into crypto_profiles')) {
      const row: StoredCryptoProfileRow = {
        userId: String(bindValues[0]),
        version: Number(bindValues[1]),
        kdf: String(bindValues[2]),
        salt: String(bindValues[3]),
        wrappedMasterKey: String(bindValues[4]),
        wrapNonce: String(bindValues[5]),
        updatedAt: String(bindValues[6]),
      }

      this.cryptoProfiles.set(row.userId, row)
      return { rowsAffected: 1 }
    }

    if (normalized.startsWith('insert into automation_events')) {
      const row: StoredAutomationEventRow = {
        id: String(bindValues[0]),
        userId: String(bindValues[1]),
        noteId: bindValues[2] === null ? null : String(bindValues[2]),
        eventType: String(bindValues[3]),
        payload: String(bindValues[4]),
        createdAt: String(bindValues[5]),
        deliveredAt: bindValues[6] === null ? null : String(bindValues[6]),
      }

      this.automationEvents.set(row.id, row)
      return { rowsAffected: 1 }
    }

    if (normalized.startsWith('update automation_events')) {
      const eventId = String(bindValues[1])
      const row = this.automationEvents.get(eventId)

      if (!row) {
        return { rowsAffected: 0 }
      }

      this.automationEvents.set(eventId, {
        ...row,
        deliveredAt: String(bindValues[0]),
      })
      return { rowsAffected: 1 }
    }

    throw new Error(`Unsupported SQL execute: ${query}`)
  }

  async select<TRow extends Record<string, unknown>>(
    query: string,
    bindValues: SqlBindValue[] = [],
  ): Promise<TRow[]> {
    const normalized = query.trim().toLowerCase()

    if (normalized.includes('from notes') && normalized.includes('where deleted_at is null')) {
      return [...this.notes.values()]
        .filter((row) => row.deletedAt === null)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map((row) => JSON.parse(JSON.stringify(row)) as TRow)
    }

    if (normalized === 'pragma table_info(notes)') {
      return [
        { name: 'id' },
        { name: 'parent_folder_id' },
      ] as unknown as TRow[]
    }

    if (normalized.includes('from folders') && normalized.includes('where deleted_at is null')) {
      return [...this.folders.values()]
        .filter((row) => row.deletedAt === null)
        .sort((left, right) => {
          const sortDiff = left.sortIndex - right.sortIndex
          return sortDiff === 0 ? left.name.localeCompare(right.name) : sortDiff
        })
        .map((row) => JSON.parse(JSON.stringify(row)) as TRow)
    }

    if (
      normalized.includes('from notes') &&
      normalized.includes('where deleted_at is not null')
    ) {
      return [...this.notes.values()]
        .filter((row) => row.deletedAt !== null)
        .sort((left, right) =>
          (right.deletedAt ?? '').localeCompare(left.deletedAt ?? ''),
        )
        .map((row) => JSON.parse(JSON.stringify(row)) as TRow)
    }

    if (normalized.includes('from notes') && normalized.includes('where id = $1')) {
      const row = this.notes.get(String(bindValues[0]))
      return row ? [JSON.parse(JSON.stringify(row)) as TRow] : []
    }

    if (normalized.includes('from note_ops') && normalized.includes('where status = $1')) {
      const limit = Number(bindValues[1])
      return [...this.noteOps.values()]
        .filter((row) => row.status === bindValues[0])
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .slice(0, limit)
        .map((row) => JSON.parse(JSON.stringify(row)) as TRow)
    }

    if (normalized.includes('from sync_state')) {
      const row = this.syncState.get(String(bindValues[0]))
      return row ? ([{ value: row.value }] as unknown as TRow[]) : []
    }

    if (normalized.includes('from crypto_profiles')) {
      const row = this.cryptoProfiles.get(String(bindValues[0]))
      return row ? [JSON.parse(JSON.stringify(row)) as TRow] : []
    }

    if (normalized.includes('from automation_events')) {
      const limit = Number(bindValues[0])
      return [...this.automationEvents.values()]
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .slice(0, limit)
        .map((row) => JSON.parse(JSON.stringify(row)) as TRow)
    }

    throw new Error(`Unsupported SQL select: ${query}`)
  }
}

const harnesses: StoreHarness[] = [
  {
    name: 'DexieNotesStore',
    async create() {
      const databaseName = `silicon_nostalgia_contract_${crypto.randomUUID()}`
      const database = createDexieDatabase(databaseName)
      const store = new DexieNotesStore({ database })

      return {
        store,
        async cleanup() {
          database.close()
          await Dexie.delete(databaseName)
        },
      }
    },
  },
  {
    name: 'SqliteNotesStore',
    async create() {
      const database = new MemorySqlDatabase()
      await initializeSqliteNotesStore(database)

      return {
        store: createSqliteNotesStore(database),
        async cleanup() {
          await Promise.resolve()
        },
      }
    },
  },
]

it('keeps SQLite notes readable after the store is recreated on the same database', async () => {
  const database = new MemorySqlDatabase()
  await initializeSqliteNotesStore(database)

  const firstSession = createSqliteNotesStore(database)
  const note = makeNote('note_sqlite_restart', 'SQLite restart')

  await firstSession.putNote(note)
  await initializeSqliteNotesStore(database)

  const secondSession = createSqliteNotesStore(database)

  expect(await secondSession.getNote(note.id)).toMatchObject({
    id: note.id,
    title: 'SQLite restart',
    updatedAt: now,
  })
  expect((await secondSession.listNotes()).map((storedNote) => storedNote.id)).toEqual([
    note.id,
  ])
})

it('delegates note and outbox writes to one database transaction', async () => {
  const database = new MemorySqlDatabase()
  await initializeSqliteNotesStore(database)
  const store = createSqliteNotesStore(database)
  const note = makeNote('note_native_transaction', 'Native transaction')

  await store.putNoteWithOp(
    note,
    makeOperation('op_native_transaction', note.id, 'note.create'),
  )

  expect(database.transactionCount).toBe(1)
  expect(await store.getNote(note.id)).toMatchObject({ title: 'Native transaction' })
  expect(await store.listPendingOps(10)).toHaveLength(1)
})

it('migrates legacy note columns before creating dependent SQLite indexes', async () => {
  const columns = new Set(['id'])
  const executed: string[] = []
  const database: SqlDatabase = {
    async execute(query) {
      const normalized = query.trim().toLowerCase()
      executed.push(normalized)

      if (
        normalized.startsWith('create index') &&
        normalized.includes('parent_folder_id') &&
        !columns.has('parent_folder_id')
      ) {
        throw new Error('no such column: parent_folder_id')
      }

      if (normalized === 'alter table notes add column parent_folder_id text') {
        columns.add('parent_folder_id')
      }

      if (normalized === 'alter table notes add column properties text') {
        columns.add('properties')
      }

      return { rowsAffected: 0 }
    },
    async select<TRow extends Record<string, unknown>>(query: string) {
      if (query.trim().toLowerCase() === 'pragma table_info(notes)') {
        return [...columns].map((name) => ({ name })) as unknown as TRow[]
      }

      throw new Error(`Unsupported SQL select: ${query}`)
    },
  }

  await initializeSqliteNotesStore(database)

  const parentMigration = executed.indexOf(
    'alter table notes add column parent_folder_id text',
  )
  const propertiesMigration = executed.indexOf(
    'alter table notes add column properties text',
  )
  const parentIndex = executed.findIndex(
    (query) => query.startsWith('create index') && query.includes('parent_folder_id'),
  )

  expect(parentMigration).toBeGreaterThanOrEqual(0)
  expect(propertiesMigration).toBeGreaterThanOrEqual(0)
  expect(parentIndex).toBeGreaterThan(parentMigration)
  expect(parentIndex).toBeGreaterThan(propertiesMigration)
})

describe.each(harnesses)('$name contract', (harness) => {
  it('stores notes locally and lists only non-deleted notes by update time', async () => {
    const { store, cleanup } = await harness.create()

    try {
      const first = makeNote('note_first', 'First note', now)
      const second = makeNote('note_second', 'Second note', later)

      await store.putNote(first)
      await store.putNote(second)

      expect(await store.getNote(first.id)).toMatchObject({
        id: first.id,
        title: 'First note',
      })

      expect((await store.listNotes()).map((note) => note.id)).toEqual([
        second.id,
        first.id,
      ])

      await store.softDeleteNote(second.id)

      expect((await store.listNotes()).map((note) => note.id)).toEqual([first.id])
      expect((await store.getNote(second.id))?.deletedAt).not.toBeNull()
    } finally {
      await cleanup()
    }
  })

  it('writes note mutation and outbox operation atomically', async () => {
    const { store, cleanup } = await harness.create()

    try {
      const note = makeNote('note_atomic', 'Atomic note')
      const op = makeOperation('op_atomic_1', note.id, 'note.create')

      await store.putNoteWithOp(note, op)

      expect(await store.getNote(note.id)).toMatchObject({
        id: note.id,
        title: 'Atomic note',
      })
      expect((await store.listPendingOps(10)).map((pending) => pending.opId)).toEqual([
        op.opId,
      ])
    } finally {
      await cleanup()
    }
  })

  it('can replace all note operations atomically when a note becomes encrypted', async () => {
    const { store, cleanup } = await harness.create()

    try {
      const note = makeNote('note_replace_ops', 'Replace ops')
      await store.putNoteWithOp(note, makeOperation('op_replace_1', note.id, 'note.create'))
      await store.enqueueOp(makeOperation('op_replace_2', note.id, 'note.update'))

      const encryptedNote: LocalNote = {
        ...note,
        title: null,
        preview: null,
        isLocked: true,
        document: null,
        encryptedPayload: 'ciphertext.base64',
        encryption: {
          version: 1,
          algorithm: 'AES-GCM-256',
          payloadNonce: 'payload-nonce',
          wrappedDek: 'wrapped-dek',
          wrapNonce: 'wrap-nonce',
        },
        localRevision: note.localRevision + 1,
        syncStatus: 'dirty',
      }
      const lockOp = makeOperation('op_replace_lock', note.id, 'note.lock')

      await store.putNoteWithOpReplacingNoteOps(encryptedNote, lockOp)

      expect(await store.getNote(note.id)).toMatchObject({
        isLocked: true,
        title: null,
        document: null,
      })
      expect((await store.listPendingOps(10)).map((op) => op.opId)).toEqual([
        lockOp.opId,
      ])
    } finally {
      await cleanup()
    }
  })

  it('rolls back note mutation when outbox write fails', async () => {
    const { store, cleanup } = await harness.create()

    try {
      const note = makeNote('note_rollback', 'Original')
      const op = makeOperation('op_duplicate', note.id)

      await store.putNoteWithOp(note, op)

      const updated: LocalNote = {
        ...note,
        title: 'Should rollback',
        updatedAt: later,
        localRevision: note.localRevision + 1,
      }

      await expect(store.putNoteWithOp(updated, op)).rejects.toThrow()

      expect(await store.getNote(note.id)).toMatchObject({
        title: 'Original',
        updatedAt: now,
      })
    } finally {
      await cleanup()
    }
  })

  it('soft deletes notes with an outbox operation atomically', async () => {
    const { store, cleanup } = await harness.create()

    try {
      const note = makeNote('note_delete', 'Delete me')
      await store.putNote(note)

      const op = makeOperation('op_delete', note.id, 'note.delete')
      await store.softDeleteNoteWithOp(note.id, deletedAt, op)

      expect(await store.listNotes()).toEqual([])
      expect((await store.getNote(note.id))?.deletedAt).toBe(deletedAt)
      expect((await store.listPendingOps(10)).map((pending) => pending.opId)).toEqual([
        op.opId,
      ])
    } finally {
      await cleanup()
    }
  })

  it('lists deleted notes and can purge them locally', async () => {
    const { store, cleanup } = await harness.create()

    try {
      const first = makeNote('note_deleted_first', 'Deleted first', now)
      const second = makeNote('note_deleted_second', 'Deleted second', later)
      const kept = makeNote('note_deleted_kept', 'Kept note')

      await store.putNote(first)
      await store.putNote(second)
      await store.putNote(kept)
      await store.softDeleteNoteWithOp(
        first.id,
        deletedAt,
        makeOperation('op_deleted_first', first.id, 'note.delete'),
      )
      await store.softDeleteNoteWithOp(
        second.id,
        later,
        makeOperation('op_deleted_second', second.id, 'note.delete'),
      )

      expect((await store.listNotes()).map((note) => note.id)).toEqual([kept.id])
      expect((await store.listDeletedNotes()).map((note) => note.id)).toEqual([
        first.id,
        second.id,
      ])

      await store.hardDeleteNote(first.id)

      expect(await store.getNote(first.id)).toBeNull()
      expect((await store.listDeletedNotes()).map((note) => note.id)).toEqual([
        second.id,
      ])
    } finally {
      await cleanup()
    }
  })

  it('stores folders and soft deletes them locally', async () => {
    const { store, cleanup } = await harness.create()

    try {
      const parent = makeFolder('folder_parent', 'Parent')
      const child = makeFolder('folder_child', 'Child', parent.id, 1)

      await store.putFolder(parent)
      await store.putFolder(child)

      expect((await store.listFolders()).map((folder) => folder.id)).toEqual([
        parent.id,
        child.id,
      ])

      await store.putFolder({
        ...child,
        name: 'Child renamed',
        localRevision: child.localRevision + 1,
      })

      expect((await store.listFolders()).find((folder) => folder.id === child.id)).toMatchObject({
        name: 'Child renamed',
        parentFolderId: parent.id,
      })

      await store.softDeleteFolder(parent.id, deletedAt)

      expect((await store.listFolders()).map((folder) => folder.id)).toEqual([child.id])
    } finally {
      await cleanup()
    }
  })

  it('updates operation status and sync state', async () => {
    const { store, cleanup } = await harness.create()

    try {
      const note = makeNote('note_ops', 'Ops')
      const op = makeOperation('op_status', note.id)

      await store.putNoteWithOp(note, op)
      await store.markOpFailed(op.opId, 'network down')

      expect(await store.listPendingOps(10)).toEqual([])

      await store.markOpSynced(op.opId)
      await store.setSyncState('notes:last_server_revision', '42')

      expect(await store.getSyncState('notes:last_server_revision')).toBe('42')
    } finally {
      await cleanup()
    }
  })

  it('stores the local crypto profile for encrypted notes', async () => {
    const { store, cleanup } = await harness.create()

    try {
      await store.setCryptoProfile({
        userId,
        version: 1,
        kdf: {
          name: 'PBKDF2',
          hash: 'SHA-256',
          iterations: 310000,
        },
        salt: 'salt.base64',
        wrappedMasterKey: 'wrapped-master-key.base64',
        wrapNonce: 'wrap-nonce.base64',
        updatedAt: now,
      })

      expect(await store.getCryptoProfile(userId)).toEqual({
        userId,
        version: 1,
        kdf: {
          name: 'PBKDF2',
          hash: 'SHA-256',
          iterations: 310000,
        },
        salt: 'salt.base64',
        wrappedMasterKey: 'wrapped-master-key.base64',
        wrapNonce: 'wrap-nonce.base64',
        updatedAt: now,
      })
    } finally {
      await cleanup()
    }
  })

  it('stores automation events for the in-process Automation Gateway', async () => {
    const { store, cleanup } = await harness.create()

    try {
      const eventId = automationEventIdSchema.parse('automation_event_contract_1')
      await store.appendAutomationEvent({
        id: eventId,
        userId,
        noteId: noteIdSchema.parse('note_event'),
        event: {
          type: 'note.updated',
          noteId: noteIdSchema.parse('note_event'),
          changedFields: ['title'],
        },
        eventType: 'note.updated',
        createdAt: now,
        deliveredAt: null,
      })

      expect(await store.listAutomationEvents(10)).toEqual([
        {
          id: eventId,
          userId,
          noteId: noteIdSchema.parse('note_event'),
          event: {
            type: 'note.updated',
            noteId: noteIdSchema.parse('note_event'),
            changedFields: ['title'],
          },
          eventType: 'note.updated',
          createdAt: now,
          deliveredAt: null,
        },
      ])

      await store.markAutomationEventDelivered(eventId, later)

      expect((await store.listAutomationEvents(10))[0]).toMatchObject({
        deliveredAt: later,
      })
    } finally {
      await cleanup()
    }
  })
})
