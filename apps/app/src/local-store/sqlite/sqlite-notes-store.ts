import type {
  LocalNotesStore,
  StoredAutomationEventRow,
  StoredCryptoProfileRow,
  StoredFolderRow,
  StoredNoteRow,
  StoredSyncOperationRow,
} from '@/local-store/contracts'
import {
  assertOperation,
  automationEventToRow,
  cryptoProfileToRow,
  folderToRow,
  noteToListItem,
  noteToRow,
  operationToRow,
  rowToAutomationEvent,
  rowToCryptoProfile,
  rowToFolder,
  rowToNote,
  rowToOperation,
} from '@/local-store/serialization'
import type {
  SqlBindValue,
  SqlDatabase,
  SqlStatement,
} from '@/local-store/sqlite/sqlite-driver'
import { runSqlStatements } from '@/local-store/sqlite/sqlite-driver'
import { loadTauriSqliteDatabase } from '@/local-store/sqlite/tauri-sqlite-driver'
import sqliteSchema from '@/local-store/sqlite/sqlite-schema.sql?raw'
import type {
  AutomationEventId,
  AutomationEventRecord,
  FolderId,
  LocalCryptoProfile,
  LocalFolder,
  LocalNote,
  NoteId,
  SyncOperation,
} from '@/shared/contracts'

const noteColumns = `
  id,
  user_id as userId,
  schema_version as schemaVersion,
  title,
  preview,
  is_locked as isLocked,
  document,
  properties,
  encrypted_payload as encryptedPayload,
  encryption,
  created_at as createdAt,
  updated_at as updatedAt,
  deleted_at as deletedAt,
  parent_folder_id as parentFolderId,
  local_revision as localRevision,
  remote_revision as remoteRevision,
  base_remote_revision as baseRemoteRevision,
  sync_status as syncStatus,
  last_op_id as lastOpId,
  device_id as deviceId
`

const folderColumns = `
  id,
  user_id as userId,
  name,
  parent_folder_id as parentFolderId,
  sort_index as sortIndex,
  created_at as createdAt,
  updated_at as updatedAt,
  deleted_at as deletedAt,
  local_revision as localRevision,
  sync_status as syncStatus,
  device_id as deviceId
`

const opColumns = `
  op_id as opId,
  note_id as noteId,
  user_id as userId,
  device_id as deviceId,
  type,
  payload,
  base_remote_revision as baseRemoteRevision,
  created_at as createdAt,
  attempt_count as attemptCount,
  last_error as lastError,
  status
`

const cryptoProfileColumns = `
  user_id as userId,
  version,
  kdf,
  salt,
  wrapped_master_key as wrappedMasterKey,
  wrap_nonce as wrapNonce,
  updated_at as updatedAt
`

const automationEventColumns = `
  id,
  user_id as userId,
  note_id as noteId,
  event_type as eventType,
  payload,
  created_at as createdAt,
  delivered_at as deliveredAt
`

function noteBindValues(row: StoredNoteRow): SqlBindValue[] {
  return [
    row.id,
    row.userId,
    row.schemaVersion,
    row.title,
    row.preview,
    row.isLocked,
    row.document,
    row.encryptedPayload,
    row.encryption,
    row.createdAt,
    row.updatedAt,
    row.deletedAt,
    row.parentFolderId,
    row.localRevision,
    row.remoteRevision,
    row.baseRemoteRevision,
    row.syncStatus,
    row.lastOpId,
    row.deviceId,
    row.properties ?? null,
  ]
}

function folderBindValues(folder: LocalFolder): SqlBindValue[] {
  const row = folderToRow(folder)

  return [
    row.id,
    row.userId,
    row.name,
    row.parentFolderId,
    row.sortIndex,
    row.createdAt,
    row.updatedAt,
    row.deletedAt,
    row.localRevision,
    row.syncStatus,
    row.deviceId,
  ]
}

function opBindValues(row: StoredSyncOperationRow): SqlBindValue[] {
  return [
    row.opId,
    row.noteId,
    row.userId,
    row.deviceId,
    row.type,
    row.payload,
    row.baseRemoteRevision,
    row.createdAt,
    row.attemptCount,
    row.lastError,
    row.status,
  ]
}

function cryptoProfileBindValues(profile: LocalCryptoProfile): SqlBindValue[] {
  const row = cryptoProfileToRow(profile)

  return [
    row.userId,
    row.version,
    row.kdf,
    row.salt,
    row.wrappedMasterKey,
    row.wrapNonce,
    row.updatedAt,
  ]
}

function automationEventBindValues(event: AutomationEventRecord): SqlBindValue[] {
  const row = automationEventToRow(event)

  return [
    row.id,
    row.userId,
    row.noteId,
    row.eventType,
    row.payload,
    row.createdAt,
    row.deliveredAt,
  ]
}

export class SqliteNotesStore implements LocalNotesStore {
  private readonly db: SqlDatabase

  constructor(db: SqlDatabase) {
    this.db = db
  }

  async listNotes() {
    const rows = await this.db.select<StoredNoteRow>(
      `select ${noteColumns}
       from notes
       where deleted_at is null
       order by updated_at desc`,
    )

    return rows.map(rowToNote).map(noteToListItem)
  }

  async listDeletedNotes() {
    const rows = await this.db.select<StoredNoteRow>(
      `select ${noteColumns}
       from notes
       where deleted_at is not null
       order by deleted_at desc`,
    )

    return rows.map(rowToNote).map(noteToListItem)
  }

  async getNote(id: NoteId) {
    const rows = await this.db.select<StoredNoteRow>(
      `select ${noteColumns}
       from notes
       where id = $1
       limit 1`,
      [id],
    )

    return rows[0] ? rowToNote(rows[0]) : null
  }

  async putNote(note: LocalNote) {
    await this.upsertNote(note)
  }

  async putNoteWithOp(note: LocalNote, op: SyncOperation) {
    await this.executeTransaction([
      this.noteUpsertStatement(note),
      this.operationInsertStatement(op),
    ])
  }

  async putNoteWithOpReplacingNoteOps(note: LocalNote, op: SyncOperation) {
    await this.executeTransaction([
      this.noteUpsertStatement(note),
      { query: 'delete from note_ops where note_id = $1', bindValues: [note.id] },
      this.operationInsertStatement(op),
    ])
  }

  async hardDeleteNote(id: NoteId) {
    await this.db.execute('delete from notes where id = $1', [id])
  }

  async softDeleteNote(id: NoteId) {
    await this.db.execute(
      `update notes
       set deleted_at = $1, sync_status = $2
       where id = $3`,
      [new Date().toISOString(), 'dirty', id],
    )
  }

  async softDeleteNoteWithOp(id: NoteId, deletedAt: string, op: SyncOperation) {
    await this.executeTransaction([
      {
        query: `update notes
         set deleted_at = $1, sync_status = $2
         where id = $3`,
        bindValues: [deletedAt, 'dirty', id],
      },
      this.operationInsertStatement(op),
    ])
  }

  async listFolders() {
    const rows = await this.db.select<StoredFolderRow>(
      `select ${folderColumns}
       from folders
       where deleted_at is null
       order by sort_index asc, name asc`,
    )

    return rows.map(rowToFolder)
  }

  async putFolder(folder: LocalFolder) {
    await this.db.execute(
      `insert into folders (
         id, user_id, name, parent_folder_id, sort_index, created_at, updated_at,
         deleted_at, local_revision, sync_status, device_id
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict(id) do update set
         user_id = excluded.user_id,
         name = excluded.name,
         parent_folder_id = excluded.parent_folder_id,
         sort_index = excluded.sort_index,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at,
         deleted_at = excluded.deleted_at,
         local_revision = excluded.local_revision,
         sync_status = excluded.sync_status,
         device_id = excluded.device_id`,
      folderBindValues(folder),
    )
  }

  async softDeleteFolder(id: FolderId, deletedAt: string) {
    await this.db.execute(
      `update folders
       set deleted_at = $1,
           updated_at = $1,
           sync_status = $2
       where id = $3`,
      [deletedAt, 'dirty', id],
    )
  }

  async enqueueOp(op: SyncOperation) {
    await this.insertOperation(op)
  }

  async listPendingOps(limit: number) {
    const rows = await this.db.select<StoredSyncOperationRow>(
      `select ${opColumns}
       from note_ops
       where status = $1
       order by created_at asc
       limit $2`,
      ['pending', limit],
    )

    return rows.map(rowToOperation)
  }

  async markOpSynced(opId: string) {
    await this.db.execute(
      `update note_ops
       set status = $1, last_error = null
       where op_id = $2`,
      ['synced', opId],
    )
  }

  async markOpFailed(opId: string, error: string) {
    await this.db.execute(
      `update note_ops
       set status = $1,
           last_error = $2,
           attempt_count = attempt_count + 1
       where op_id = $3`,
      ['failed', error, opId],
    )
  }

  async appendAutomationEvent(event: AutomationEventRecord) {
    await this.db.execute(
      `insert into automation_events (
         id, user_id, note_id, event_type, payload, created_at, delivered_at
       )
       values ($1, $2, $3, $4, $5, $6, $7)`,
      automationEventBindValues(event),
    )
  }

  async listAutomationEvents(limit: number) {
    const rows = await this.db.select<StoredAutomationEventRow>(
      `select ${automationEventColumns}
       from automation_events
       order by created_at asc
       limit $1`,
      [limit],
    )

    return rows.map(rowToAutomationEvent)
  }

  async markAutomationEventDelivered(
    eventId: AutomationEventId,
    deliveredAt: string,
  ) {
    await this.db.execute(
      `update automation_events
       set delivered_at = $1
       where id = $2`,
      [deliveredAt, eventId],
    )
  }

  async getCryptoProfile(userId: string) {
    const rows = await this.db.select<StoredCryptoProfileRow>(
      `select ${cryptoProfileColumns}
       from crypto_profiles
       where user_id = $1
       limit 1`,
      [userId],
    )
    return rows[0] ? rowToCryptoProfile(rows[0]) : null
  }

  async setCryptoProfile(profile: LocalCryptoProfile) {
    await this.db.execute(
      `insert into crypto_profiles (
         user_id, version, kdf, salt, wrapped_master_key, wrap_nonce, updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict(user_id) do update set
         version = excluded.version,
         kdf = excluded.kdf,
         salt = excluded.salt,
         wrapped_master_key = excluded.wrapped_master_key,
         wrap_nonce = excluded.wrap_nonce,
         updated_at = excluded.updated_at`,
      cryptoProfileBindValues(profile),
    )
  }

  async getSyncState(key: string) {
    const rows = await this.db.select<{ value: string }>(
      'select value from sync_state where key = $1 limit 1',
      [key],
    )
    return rows[0]?.value ?? null
  }

  async setSyncState(key: string, value: string) {
    await this.db.execute(
      `insert into sync_state (key, value, updated_at)
       values ($1, $2, $3)
       on conflict(key) do update set
         value = excluded.value,
         updated_at = excluded.updated_at`,
      [key, value, new Date().toISOString()],
    )
  }

  private async upsertNote(note: LocalNote) {
    const statement = this.noteUpsertStatement(note)
    await this.db.execute(statement.query, statement.bindValues)
  }

  private noteUpsertStatement(note: LocalNote): SqlStatement {
    return {
      query: `insert into notes (
         id, user_id, schema_version, title, preview, is_locked, document,
         encrypted_payload, encryption, created_at, updated_at, deleted_at,
         parent_folder_id, local_revision, remote_revision, base_remote_revision,
         sync_status, last_op_id, device_id, properties
       )
       values (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
       )
       on conflict(id) do update set
         user_id = excluded.user_id,
         schema_version = excluded.schema_version,
         title = excluded.title,
         preview = excluded.preview,
         is_locked = excluded.is_locked,
         document = excluded.document,
         properties = excluded.properties,
         encrypted_payload = excluded.encrypted_payload,
         encryption = excluded.encryption,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at,
         deleted_at = excluded.deleted_at,
         parent_folder_id = excluded.parent_folder_id,
         local_revision = excluded.local_revision,
         remote_revision = excluded.remote_revision,
         base_remote_revision = excluded.base_remote_revision,
         sync_status = excluded.sync_status,
         last_op_id = excluded.last_op_id,
         device_id = excluded.device_id`,
      bindValues: noteBindValues(noteToRow(note)),
    }
  }

  private async insertOperation(op: SyncOperation) {
    const statement = this.operationInsertStatement(op)
    await this.db.execute(statement.query, statement.bindValues)
  }

  private operationInsertStatement(op: SyncOperation): SqlStatement {
    return {
      query: `insert into note_ops (
         op_id, note_id, user_id, device_id, type, payload,
         base_remote_revision, created_at, attempt_count, last_error, status
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      bindValues: opBindValues(operationToRow(assertOperation(op))),
    }
  }

  private async executeTransaction(statements: SqlStatement[]) {
    if (this.db.executeTransaction) {
      await this.db.executeTransaction(statements)
      return
    }

    // Non-Tauri adapters used by contract tests retain the callback-style
    // transaction fallback. The desktop adapter always uses one native SQLx
    // transaction so BEGIN/COMMIT cannot be split across pooled connections.
    await this.db.execute('begin immediate')
    try {
      for (const statement of statements) {
        await this.db.execute(statement.query, statement.bindValues)
      }
      await this.db.execute('commit')
    } catch (error) {
      await this.db.execute('rollback')
      throw error
    }
  }
}

export function createSqliteNotesStore(db: SqlDatabase): SqliteNotesStore {
  return new SqliteNotesStore(db)
}

export async function initializeSqliteNotesStore(db: SqlDatabase): Promise<void> {
  const schemaStatements = sqliteSchema
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
  const tableStatements = schemaStatements.filter(
    (statement) => !/^create\s+(?:unique\s+)?index\b/i.test(statement),
  )
  const indexStatements = schemaStatements.filter((statement) =>
    /^create\s+(?:unique\s+)?index\b/i.test(statement),
  )

  // Existing databases can predate columns used by newer indexes. Create the
  // tables first, migrate their columns, and only then create dependent
  // indexes; otherwise SQLite aborts startup before migrations can run.
  await runSqlStatements(db, tableStatements.join(';'))
  await ensureSqliteNotesMigrations(db)
  await runSqlStatements(db, indexStatements.join(';'))
}

async function ensureSqliteNotesMigrations(db: SqlDatabase): Promise<void> {
  const columns = await db.select<{ name: string }>('pragma table_info(notes)')
  const hasParentFolderId = columns.some((column) => column.name === 'parent_folder_id')
  const hasProperties = columns.some((column) => column.name === 'properties')

  if (!hasParentFolderId) {
    await db.execute('alter table notes add column parent_folder_id text')
  }

  if (!hasProperties) {
    await db.execute('alter table notes add column properties text')
  }
}

export async function createTauriSqliteNotesStore(
  connectionString?: string,
): Promise<SqliteNotesStore> {
  const db = await loadTauriSqliteDatabase(connectionString)
  await initializeSqliteNotesStore(db)
  return new SqliteNotesStore(db)
}
