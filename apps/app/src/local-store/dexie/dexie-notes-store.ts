import type { LocalNotesStore } from '@/local-store/contracts'
import { createDexieDatabase, type SiliconDexieDatabase } from '@/local-store/dexie/dexie-db'
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
  AutomationEventId,
  AutomationEventRecord,
  FolderId,
  LocalCryptoProfile,
  LocalFolder,
  LocalNote,
  NoteId,
  SyncOperation,
} from '@/shared/contracts'

export type DexieNotesStoreOptions = {
  databaseName?: string
  database?: SiliconDexieDatabase
}

export class DexieNotesStore implements LocalNotesStore {
  readonly db: SiliconDexieDatabase

  constructor(options: DexieNotesStoreOptions = {}) {
    this.db = options.database ?? createDexieDatabase(options.databaseName)
  }

  async listNotes() {
    const rows = (await this.db.notes.toArray())
      .filter((row) => row.deletedAt === null)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))

    return rows.map(rowToNote).map(noteToListItem)
  }

  async listDeletedNotes() {
    const rows = (await this.db.notes.toArray())
      .filter((row) => row.deletedAt !== null)
      .sort((left, right) =>
        (right.deletedAt ?? right.updatedAt).localeCompare(left.deletedAt ?? left.updatedAt),
      )

    return rows.map(rowToNote).map(noteToListItem)
  }

  async getNote(id: NoteId) {
    const row = await this.db.notes.get(id)
    return row ? rowToNote(row) : null
  }

  async putNote(note: LocalNote) {
    await this.db.notes.put(noteToRow(note))
  }

  async putNoteWithOp(note: LocalNote, op: SyncOperation) {
    const operation = assertOperation(op)

    await this.db.transaction('rw', this.db.notes, this.db.noteOps, async () => {
      await this.db.notes.put(noteToRow(note))
      await this.db.noteOps.add(operationToRow(operation))
    })
  }

  async putNoteWithOpReplacingNoteOps(note: LocalNote, op: SyncOperation) {
    const operation = assertOperation(op)

    await this.db.transaction('rw', this.db.notes, this.db.noteOps, async () => {
      await this.db.notes.put(noteToRow(note))
      await this.db.noteOps.where('noteId').equals(note.id).delete()
      await this.db.noteOps.add(operationToRow(operation))
    })
  }

  async hardDeleteNote(id: NoteId) {
    await this.db.notes.delete(id)
  }

  async softDeleteNote(id: NoteId) {
    await this.db.notes.update(id, {
      deletedAt: new Date().toISOString(),
      syncStatus: 'dirty',
    })
  }

  async softDeleteNoteWithOp(id: NoteId, deletedAt: string, op: SyncOperation) {
    const operation = assertOperation(op)

    await this.db.transaction('rw', this.db.notes, this.db.noteOps, async () => {
      await this.db.notes.update(id, {
        deletedAt,
        syncStatus: 'dirty',
      })
      await this.db.noteOps.add(operationToRow(operation))
    })
  }

  async listFolders() {
    const rows = (await this.db.folders.toArray())
      .filter((row) => row.deletedAt === null)
      .sort((left, right) => {
        const sortDiff = left.sortIndex - right.sortIndex
        return sortDiff === 0 ? left.name.localeCompare(right.name) : sortDiff
      })

    return rows.map(rowToFolder)
  }

  async putFolder(folder: LocalFolder) {
    await this.db.folders.put(folderToRow(folder))
  }

  async softDeleteFolder(id: FolderId, deletedAt: string) {
    await this.db.folders.update(id, {
      deletedAt,
      updatedAt: deletedAt,
      syncStatus: 'dirty',
    })
  }

  async enqueueOp(op: SyncOperation) {
    await this.db.noteOps.add(operationToRow(assertOperation(op)))
  }

  async listPendingOps(limit: number) {
    const rows = await this.db.noteOps
      .where('status')
      .equals('pending')
      .sortBy('createdAt')

    return rows.slice(0, limit).map(rowToOperation)
  }

  async markOpSynced(opId: string) {
    await this.db.noteOps.update(opId, {
      status: 'synced',
      lastError: null,
    })
  }

  async markOpFailed(opId: string, error: string) {
    const row = await this.db.noteOps.get(opId)

    if (!row) {
      return
    }

    await this.db.noteOps.update(opId, {
      status: 'failed',
      lastError: error,
      attemptCount: row.attemptCount + 1,
    })
  }

  async appendAutomationEvent(event: AutomationEventRecord) {
    await this.db.automationEvents.add(automationEventToRow(event))
  }

  async listAutomationEvents(limit: number) {
    const rows = await this.db.automationEvents
      .orderBy('createdAt')
      .limit(limit)
      .toArray()

    return rows.map(rowToAutomationEvent)
  }

  async markAutomationEventDelivered(
    eventId: AutomationEventId,
    deliveredAt: string,
  ) {
    await this.db.automationEvents.update(eventId, {
      deliveredAt,
    })
  }

  async getCryptoProfile(userId: string) {
    const row = await this.db.cryptoProfiles.get(userId)
    return row ? rowToCryptoProfile(row) : null
  }

  async setCryptoProfile(profile: LocalCryptoProfile) {
    await this.db.cryptoProfiles.put(cryptoProfileToRow(profile))
  }

  async getSyncState(key: string) {
    const row = await this.db.syncState.get(key)
    return row?.value ?? null
  }

  async setSyncState(key: string, value: string) {
    await this.db.syncState.put({
      key,
      value,
      updatedAt: new Date().toISOString(),
    })
  }
}

export function createDexieNotesStore(options?: DexieNotesStoreOptions): DexieNotesStore {
  return new DexieNotesStore(options)
}
