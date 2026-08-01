import type { JsonObject, JsonValue, LocalNote } from '@/shared/contracts'

export type NoteSnapshotPayload = JsonObject & {
  kind: 'note.snapshot'
}

/**
 * Wraps a note as the JSON snapshot the outbox stores.
 *
 * The note reached this point through `localNoteSchema`, whose fields are all
 * JSON primitives, arrays or objects by construction — including `document`,
 * which `noteDocumentSchema` already validated. Re-validating it here as a
 * generic JSON value walked the whole document a second time and dominated the
 * cost of saving a large note: on a 50k-message chat that walk alone took
 * ~700ms per save. The fields are copied explicitly instead, so the payload
 * shape stays pinned by the type checker rather than by a runtime scan.
 */
export function mapLocalNoteToSyncPayload(note: LocalNote): NoteSnapshotPayload {
  const snapshot: JsonObject = {
    id: note.id,
    userId: note.userId,
    schemaVersion: note.schemaVersion,
    title: note.title,
    preview: note.preview,
    isLocked: note.isLocked,
    document: (note.document ?? null) as JsonValue,
    encryptedPayload: note.encryptedPayload,
    encryption: (note.encryption ?? null) as JsonValue,
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

  if (!note.isLocked && note.properties) {
    snapshot.properties = note.properties as JsonValue
  }

  return {
    kind: 'note.snapshot',
    note: snapshot,
  } as NoteSnapshotPayload
}
