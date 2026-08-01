import type { NoteRepository } from '@/repository/contracts'
import type { NoteId } from '@/shared/contracts'
import { useLiveQuery, useOwnedLiveQuery } from '@/viewmodel/live-query-view-model'
import { useImageRepository, useNoteRepository } from '@/viewmodel/repository-hooks'
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
  const imageRepository = useImageRepository()
  const syncEngine = useSyncEngine()
  const liveQuery = useOwnedLiveQuery(() => repository.liveTrashList(), [repository])
  const trashedNotes = useLiveQuery(liveQuery)

  return {
    async purgeNote(noteId) {
      await repository.purgeNote(noteId)

      try {
        await imageRepository?.purgeNoteImages(noteId)
      } catch {
        // The image metadata remains discoverable. Repository boot compares all
        // image rows with existing notes and retries this cleanup, so the note
        // purge is not reported as failed after it has already committed.
      }
    },
    async restoreNote(noteId) {
      await repository.restoreNote(noteId)
      syncEngine?.requestSync('outbox-change')
    },
    trashedNotes,
  }
}
