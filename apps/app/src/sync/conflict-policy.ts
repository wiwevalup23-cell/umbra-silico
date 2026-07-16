import {
  localNoteSchema,
  type ConflictRecord,
  type LocalNote,
  type RemoteNoteChange,
} from '@/shared/contracts'

export type ConflictClock = () => string

export type RemoteChangeDecision =
  | { action: 'apply' }
  | { action: 'conflict'; conflict: ConflictRecord }
  | { action: 'skip' }

function extractRemoteNote(change: RemoteNoteChange): LocalNote | null {
  if (
    !change.payload ||
    typeof change.payload !== 'object' ||
    Array.isArray(change.payload) ||
    change.payload.kind !== 'note.snapshot'
  ) {
    return null
  }

  const notePayload = change.payload.note

  if (!notePayload || typeof notePayload !== 'object' || Array.isArray(notePayload)) {
    return null
  }

  return localNoteSchema.parse(notePayload)
}

function isLocalDirty(note: LocalNote): boolean {
  return (
    note.syncStatus === 'dirty' ||
    note.syncStatus === 'syncing' ||
    note.syncStatus === 'error'
  )
}

export function decideRemoteChange(
  localNote: LocalNote | null,
  change: RemoteNoteChange,
  clock: ConflictClock,
): RemoteChangeDecision {
  if (!localNote) {
    return { action: 'apply' }
  }

  const knownRevision = localNote.remoteRevision ?? localNote.baseRemoteRevision ?? 0

  if (change.serverRevision <= knownRevision) {
    return { action: 'skip' }
  }

  const remoteNote = extractRemoteNote(change)

  if (localNote.syncStatus === 'conflict') {
    return { action: 'skip' }
  }

  if (!isLocalDirty(localNote)) {
    return { action: 'apply' }
  }

  if (remoteNote?.lastOpId && remoteNote.lastOpId === localNote.lastOpId) {
    return { action: 'apply' }
  }

  if (
    change.changedByDeviceId &&
    change.changedByDeviceId === localNote.deviceId
  ) {
    return { action: 'skip' }
  }

  return {
    action: 'conflict',
    conflict: {
      detectedAt: clock(),
      localRevision: localNote.localRevision,
      noteId: localNote.id,
      remoteRevision: change.serverRevision,
    },
  }
}
