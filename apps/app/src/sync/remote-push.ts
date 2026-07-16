import type { NoteRepository } from '@/repository/contracts'
import type { RemoteNoteChange, SyncOperation } from '@/shared/contracts'
import type { SupabaseRemoteGateway } from '@/sync/supabase'

export type RemotePushResult = {
  operation: SyncOperation
  remoteRevision: number
}

export type RemotePushDependencies = {
  noteRepository: NoteRepository
  remoteGateway: SupabaseRemoteGateway
}

export async function pushOperation({
  noteRepository,
  operation,
  remoteGateway,
}: RemotePushDependencies & {
  operation: SyncOperation
}): Promise<RemotePushResult> {
  const remoteRevision = await remoteGateway.pushOperation(operation)
  const acknowledgedChange: RemoteNoteChange = {
    changedByDeviceId: operation.deviceId,
    noteId: operation.noteId,
    payload: operation.payload,
    serverRevision: remoteRevision,
  }

  await noteRepository.applyRemoteChange(acknowledgedChange)
  await noteRepository.markOpSynced(operation.opId, remoteRevision)

  return {
    operation,
    remoteRevision,
  }
}
