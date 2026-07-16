import type {
  StoredAutomationEventRow,
  StoredCryptoProfileRow,
  StoredFolderRow,
  StoredNoteRow,
  StoredSyncOperationRow,
} from '@/local-store/contracts'
import {
  localCryptoProfileSchema,
  localFolderSchema,
  localNoteSchema,
  parseAutomationEventRecord,
  parseSyncOperation,
  syncOperationSchema,
  toLockedListItem,
  toPlaintextListItem,
  type AutomationEventRecord,
  type LocalCryptoProfile,
  type LocalFolder,
  type LocalNote,
  type NoteListItem,
  type SyncOperation,
} from '@/shared/contracts'

function stringify(value: unknown): string {
  return JSON.stringify(value)
}

function parseJson(value: string): unknown {
  return JSON.parse(value)
}

export function noteToRow(note: LocalNote): StoredNoteRow {
  return {
    id: note.id,
    userId: note.userId,
    schemaVersion: note.schemaVersion,
    title: note.title,
    preview: note.preview,
    isLocked: note.isLocked ? 1 : 0,
    document: note.document ? stringify(note.document) : null,
    properties: note.isLocked ? null : stringify(note.properties ?? { status: 'none', tags: [] }),
    encryptedPayload: note.encryptedPayload,
    encryption: note.encryption ? stringify(note.encryption) : null,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    deletedAt: note.deletedAt,
    parentFolderId: note.parentFolderId,
    localRevision: note.localRevision,
    remoteRevision: note.remoteRevision,
    baseRemoteRevision: note.baseRemoteRevision,
    syncStatus: note.syncStatus,
    lastOpId: note.lastOpId,
    deviceId: note.deviceId,
  }
}

export function rowToNote(row: StoredNoteRow): LocalNote {
  return localNoteSchema.parse({
    id: row.id,
    userId: row.userId,
    schemaVersion: row.schemaVersion,
    title: row.title,
    preview: row.preview,
    isLocked: row.isLocked === 1,
    document: row.document ? parseJson(row.document) : null,
    properties: row.properties ? parseJson(row.properties) : undefined,
    encryptedPayload: row.encryptedPayload,
    encryption: row.encryption ? parseJson(row.encryption) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    parentFolderId: row.parentFolderId ?? null,
    localRevision: row.localRevision,
    remoteRevision: row.remoteRevision,
    baseRemoteRevision: row.baseRemoteRevision,
    syncStatus: row.syncStatus,
    lastOpId: row.lastOpId,
    deviceId: row.deviceId,
  })
}

export function folderToRow(folder: LocalFolder): StoredFolderRow {
  return {
    id: folder.id,
    userId: folder.userId,
    name: folder.name,
    parentFolderId: folder.parentFolderId,
    sortIndex: folder.sortIndex,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
    deletedAt: folder.deletedAt,
    localRevision: folder.localRevision,
    syncStatus: folder.syncStatus,
    deviceId: folder.deviceId,
  }
}

export function rowToFolder(row: StoredFolderRow): LocalFolder {
  return localFolderSchema.parse({
    id: row.id,
    userId: row.userId,
    name: row.name,
    parentFolderId: row.parentFolderId,
    sortIndex: row.sortIndex,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    localRevision: row.localRevision,
    syncStatus: row.syncStatus,
    deviceId: row.deviceId,
  })
}

export function noteToListItem(note: LocalNote): NoteListItem {
  return note.isLocked ? toLockedListItem(note) : toPlaintextListItem(note)
}

export function operationToRow(op: SyncOperation): StoredSyncOperationRow {
  return {
    opId: op.opId,
    noteId: op.noteId,
    userId: op.userId,
    deviceId: op.deviceId,
    type: op.type,
    payload: stringify(op.payload),
    baseRemoteRevision: op.baseRemoteRevision,
    createdAt: op.createdAt,
    attemptCount: op.attemptCount,
    lastError: op.lastError,
    status: op.status,
  }
}

export function rowToOperation(row: StoredSyncOperationRow): SyncOperation {
  return parseSyncOperation({
    opId: row.opId,
    noteId: row.noteId,
    userId: row.userId,
    deviceId: row.deviceId,
    type: row.type,
    payload: parseJson(row.payload),
    baseRemoteRevision: row.baseRemoteRevision,
    createdAt: row.createdAt,
    attemptCount: row.attemptCount,
    lastError: row.lastError,
    status: row.status,
  })
}

export function cryptoProfileToRow(
  profile: LocalCryptoProfile,
): StoredCryptoProfileRow {
  return {
    userId: profile.userId,
    version: profile.version,
    kdf: stringify(profile.kdf),
    salt: profile.salt,
    wrappedMasterKey: profile.wrappedMasterKey,
    wrapNonce: profile.wrapNonce,
    updatedAt: profile.updatedAt,
  }
}

export function rowToCryptoProfile(row: StoredCryptoProfileRow): LocalCryptoProfile {
  return localCryptoProfileSchema.parse({
    userId: row.userId,
    version: row.version,
    kdf: parseJson(row.kdf),
    salt: row.salt,
    wrappedMasterKey: row.wrappedMasterKey,
    wrapNonce: row.wrapNonce,
    updatedAt: row.updatedAt,
  })
}

export function automationEventToRow(
  event: AutomationEventRecord,
): StoredAutomationEventRow {
  return {
    id: event.id,
    userId: event.userId,
    noteId: event.noteId,
    eventType: event.eventType,
    payload: stringify(event.event),
    createdAt: event.createdAt,
    deliveredAt: event.deliveredAt,
  }
}

export function rowToAutomationEvent(row: StoredAutomationEventRow): AutomationEventRecord {
  return parseAutomationEventRecord({
    id: row.id,
    userId: row.userId,
    noteId: row.noteId,
    event: parseJson(row.payload),
    eventType: row.eventType,
    createdAt: row.createdAt,
    deliveredAt: row.deliveredAt,
  })
}

export function assertOperation(op: SyncOperation): SyncOperation {
  return syncOperationSchema.parse(op)
}
