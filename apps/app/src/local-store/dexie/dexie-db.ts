import Dexie, { type EntityTable } from 'dexie'
import type {
  StoredAutomationEventRow,
  StoredCryptoProfileRow,
  StoredFolderRow,
  StoredNoteRow,
  StoredSyncOperationRow,
  StoredSyncStateRow,
} from '@/local-store/contracts'

export type SiliconDexieDatabase = Dexie & {
  notes: EntityTable<StoredNoteRow, 'id'>
  folders: EntityTable<StoredFolderRow, 'id'>
  noteOps: EntityTable<StoredSyncOperationRow, 'opId'>
  syncState: EntityTable<StoredSyncStateRow, 'key'>
  cryptoProfiles: EntityTable<StoredCryptoProfileRow, 'userId'>
  automationEvents: EntityTable<StoredAutomationEventRow, 'id'>
}

export function createDexieDatabase(name = 'silicon-nostalgia'): SiliconDexieDatabase {
  const db = new Dexie(name) as SiliconDexieDatabase

  db.version(1).stores({
    notes:
      'id, userId, updatedAt, deletedAt, isLocked, syncStatus, remoteRevision',
    noteOps: 'opId, noteId, userId, status, createdAt',
    syncState: 'key',
    cryptoProfiles: 'userId',
    automationEvents: 'id, userId, noteId, eventType, createdAt, deliveredAt',
  })

  db.version(2).stores({
    notes:
      'id, userId, updatedAt, deletedAt, parentFolderId, isLocked, syncStatus, remoteRevision',
    folders: 'id, userId, parentFolderId, deletedAt, updatedAt',
    noteOps: 'opId, noteId, userId, status, createdAt',
    syncState: 'key',
    cryptoProfiles: 'userId',
    automationEvents: 'id, userId, noteId, eventType, createdAt, deliveredAt',
  })

  return db
}
