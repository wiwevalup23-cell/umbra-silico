import type { NoteRepository } from '@/repository/contracts'
import type { RemoteNoteChange } from '@/shared/contracts'
import { decideRemoteChange, type ConflictClock } from '@/sync/conflict-policy'
import type { SupabaseRemoteGateway } from '@/sync/supabase'

export type RemotePullResult = {
  applied: number
  changes: RemoteNoteChange[]
  conflicts: number
  nextRevision: number | null
  skipped: number
}

export type RemotePullDependencies = {
  clock: ConflictClock
  noteRepository: NoteRepository
  remoteGateway: SupabaseRemoteGateway
}

export async function applyRemoteChange({
  change,
  clock,
  noteRepository,
}: {
  change: RemoteNoteChange
  clock: ConflictClock
  noteRepository: NoteRepository
}): Promise<'applied' | 'conflict' | 'skipped'> {
  const localNote = await noteRepository.getNote(change.noteId)
  const decision = decideRemoteChange(localNote, change, clock)

  if (decision.action === 'apply') {
    await noteRepository.applyRemoteChange(change)
    await noteRepository.setLastServerRevision(change.serverRevision)
    return 'applied'
  }

  if (decision.action === 'conflict') {
    await noteRepository.markConflict(change.noteId, decision.conflict, change)
    await noteRepository.setLastServerRevision(change.serverRevision)
    return 'conflict'
  }

  await noteRepository.setLastServerRevision(change.serverRevision)
  return 'skipped'
}

export async function pullRemoteChanges({
  clock,
  limit = 500,
  noteRepository,
  remoteGateway,
  sinceRevision,
}: RemotePullDependencies & {
  limit?: number
  sinceRevision: number
}): Promise<RemotePullResult> {
  const changes = await remoteGateway.pullSince(sinceRevision, limit)
  let applied = 0
  let conflicts = 0
  let skipped = 0
  let nextRevision: number | null = null

  for (const change of changes) {
    const result = await applyRemoteChange({
      change,
      clock,
      noteRepository,
    })

    if (result === 'applied') {
      applied += 1
    } else if (result === 'conflict') {
      conflicts += 1
    } else {
      skipped += 1
    }

    nextRevision = Math.max(nextRevision ?? 0, change.serverRevision)
  }

  return {
    applied,
    changes,
    conflicts,
    nextRevision,
    skipped,
  }
}
