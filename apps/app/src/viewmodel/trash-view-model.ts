import { useMemo } from 'react'
import type { NoteRepository } from '@/repository/contracts'
import type { NoteId } from '@/shared/contracts'
import { useLiveQuery } from '@/viewmodel/live-query-view-model'
import { useNoteRepository } from '@/viewmodel/repository-hooks'
import { useSyncEngine } from '@/viewmodel/sync-engine-hooks'

export type TrashViewModel = {
  purgeNote(noteId: NoteId): Promise<void>
  restoreNote(noteId: NoteId): Promise<void>
  trashedNotes: ReturnType<NoteRepository['liveTrashList']> extends {
    getSnapshot(): infer TValue
  }
    ? TValue
    : never
}

export function useTrashViewModel(): TrashViewModel {
  const repository = useNoteRepository()
  const syncEngine = useSyncEngine()
  const liveQuery = useMemo(() => repository.liveTrashList(), [repository])
  const trashedNotes = useLiveQuery(liveQuery)

  return {
    async purgeNote(noteId) {
      await repository.purgeNote(noteId)
    },
    async restoreNote(noteId) {
      await repository.restoreNote(noteId)
      syncEngine?.requestSync('outbox-change')
    },
    trashedNotes,
  }
}
