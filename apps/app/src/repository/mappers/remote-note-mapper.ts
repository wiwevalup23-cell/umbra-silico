import {
  localNoteSchema,
  type LocalNote,
  type RemoteNoteChange,
} from '@/shared/contracts'

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

  return note
}
