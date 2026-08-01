import { createNoteSearchText } from '@/shared/document-text'
import type {
  StoredAutomationEventRow,
  StoredCryptoProfileRow,
  StoredFolderRow,
  StoredImageMetaRow,
  StoredNoteRow,
  StoredSyncOperationRow,
} from '@/local-store/contracts'
import {
  localCryptoProfileSchema,
  localFolderSchema,
  localImageMetaSchema,
  localNoteSchema,
  noteListItemSchema,
  parseAutomationEventRecord,
  parseSyncOperation,
  syncOperationSchema,
  toLockedListItem,
  toPlaintextListItem,
  type AutomationEventRecord,
  type LocalCryptoProfile,
  type LocalFolder,
  type LocalImageMeta,
  type LocalNote,
  type NoteListItem,
  type NoteProperties,
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
    searchText: note.isLocked ? null : createNoteSearchText(note.document),
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

export function imageMetaToRow(meta: LocalImageMeta): StoredImageMetaRow {
  return {
    id: meta.id,
    noteId: meta.noteId,
    userId: meta.userId,
    sourceFileName: meta.sourceFileName,
    mimeType: meta.mimeType,
    byteSize: meta.byteSize,
    width: meta.width,
    height: meta.height,
    renditions: stringify(meta.renditions),
    isEncrypted: meta.isEncrypted ? 1 : 0,
    encryption: meta.encryption ? stringify(meta.encryption) : null,
    createdAt: meta.createdAt,
    deletedAt: meta.deletedAt,
    localRevision: meta.localRevision,
    syncStatus: meta.syncStatus,
    deviceId: meta.deviceId,
  }
}

export function rowToImageMeta(row: StoredImageMetaRow): LocalImageMeta {
  return localImageMetaSchema.parse({
    id: row.id,
    noteId: row.noteId,
    userId: row.userId,
    sourceFileName: row.sourceFileName,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    width: row.width,
    height: row.height,
    renditions: parseJson(row.renditions),
    isEncrypted: row.isEncrypted === 1,
    encryption: row.encryption ? parseJson(row.encryption) : null,
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
    localRevision: row.localRevision,
    syncStatus: row.syncStatus,
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

/**
 * The subset of a note row a list item is built from. Declaring it separately
 * lets SQL adapters project only these columns, so the document never leaves
 * the database for a list query.
 */
export type StoredNoteListRow = Pick<
  StoredNoteRow,
  | 'id'
  | 'title'
  | 'preview'
  | 'isLocked'
  | 'properties'
  | 'parentFolderId'
  | 'updatedAt'
  | 'syncStatus'
>

export const storedNoteListColumns = [
  'id',
  'title',
  'preview',
  'isLocked',
  'properties',
  'parentFolderId',
  'updatedAt',
  'syncStatus',
] as const satisfies ReadonlyArray<keyof StoredNoteListRow>

/**
 * Builds a list item straight from the stored row, without ever touching the
 * `document` column. List queries only need the metadata, and a note document
 * can be megabytes, so going through `rowToNote` would spend a full JSON.parse
 * plus document validation per note only to discard the result.
 */
export function rowToListItem(row: StoredNoteListRow): NoteListItem {
  if (row.isLocked === 1) {
    return noteListItemSchema.parse({
      id: row.id,
      title: 'Locked note',
      preview: '',
      isLocked: true,
      parentFolderId: row.parentFolderId ?? null,
      updatedAt: row.updatedAt,
      syncStatus: row.syncStatus,
    })
  }

  const properties = row.properties
    ? (parseJson(row.properties) as Partial<NoteProperties>)
    : null

  return noteListItemSchema.parse({
    id: row.id,
    title: row.title,
    preview: row.preview,
    isLocked: false,
    parentFolderId: row.parentFolderId ?? null,
    updatedAt: row.updatedAt,
    syncStatus: row.syncStatus,
    kind: properties?.kind,
    propertyStatus: properties?.status,
    tags: properties?.tags,
  })
}

/** The columns a search has to look at. */
export type StoredNoteSearchRow = Pick<
  StoredNoteRow,
  'id' | 'title' | 'preview' | 'searchText' | 'properties' | 'deletedAt'
>

export const storedNoteSearchColumns = [
  'id',
  'title',
  'preview',
  'searchText',
  'properties',
  'deletedAt',
] as const satisfies ReadonlyArray<keyof StoredNoteSearchRow>

/**
 * Decides whether a stored note matches a search term, shared by every adapter
 * so search means the same thing on SQLite and IndexedDB.
 *
 * `searchText` is absent on rows written before full-text search existed; those
 * fall back to title and preview and are upgraded the next time they are saved.
 * A locked note stores no search text at all, so it can only match on metadata.
 */
export function rowMatchesSearch(
  row: StoredNoteSearchRow,
  normalizedTerm: string,
): boolean {
  if (!normalizedTerm) {
    return true
  }

  if (row.title?.toLocaleLowerCase().includes(normalizedTerm)) {
    return true
  }

  // searchText already holds the whole body lowercased; preview is the legacy
  // fallback and only covers the first 180 characters.
  const body = row.searchText ?? row.preview?.toLocaleLowerCase() ?? null

  if (body?.includes(normalizedTerm)) {
    return true
  }

  const tags = row.properties
    ? (parseJson(row.properties) as Partial<NoteProperties>).tags
    : null

  return tags?.some((tag) => tag.toLocaleLowerCase().includes(normalizedTerm)) ?? false
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
    recovery: profile.recovery ? stringify(profile.recovery) : null,
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
    recovery: row.recovery ? parseJson(row.recovery) : null,
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
