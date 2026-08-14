import {
  localNoteSchema,
  type LocalNote,
  type RemoteNoteChange,
} from '@/shared/contracts'
import { sanitizeNoteDocumentStyles } from '@/shared/document-styles'

export function mapRemoteChangeToLocalNote(change: RemoteNoteChange): LocalNote {
  if (
    !change.payload ||
    typeof change.payload !== 'object' ||
    Array.isArray(change.payload) ||
    change.payload.kind !== 'note.snapshot'
  ) {
    throw new Error('Unsupported remote note payload.')
  }

  const notePayload = change.payload.note

  if (!notePayload || typeof notePayload !== 'object' || Array.isArray(notePayload)) {
    throw new Error('Remote note snapshot is missing note data.')
  }

  const note = localNoteSchema.parse({
    ...notePayload,
    remoteRevision: change.serverRevision,
    baseRemoteRevision: change.serverRevision,
    syncStatus: 'synced',
  })

  if (note.isLocked) {
    return note
  }

  // A remote note was authored somewhere this device does not control, so its
  // style attributes get the same scrub as any other document arriving from
  // outside. Both remote paths — applying a change and copying one aside as a
  // conflict — come through here, which is why it belongs in the mapper.
  return { ...note, document: sanitizeNoteDocumentStyles(note.document) }
}
