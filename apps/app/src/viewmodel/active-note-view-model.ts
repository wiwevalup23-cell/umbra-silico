import {
  collectImageIdsFromDocument,
  type NoteDetail,
  type NoteDocument,
  type NoteId,
  type NoteProperties,
} from '@/shared/contracts'
import { useAppUiStore } from '@/viewmodel/app-ui-store'
import {
  createStaticLiveQuery,
  useLiveQuery,
  useOwnedLiveQuery,
} from '@/viewmodel/live-query-view-model'
import { useImageRepository, useNoteRepository } from '@/viewmodel/repository-hooks'
import { useSyncEngine } from '@/viewmodel/sync-engine-hooks'

export type ActiveNoteViewModel = {
  activeNoteId: NoteId | null
  note: NoteDetail | null
  setActiveNote(noteId: NoteId | null): void
  /** Each write answers with the `localRevision` it produced; see `NoteRepository.updateNote`. */
  updateDocument(noteId: NoteId, document: NoteDocument): Promise<number>
  updateProperties(noteId: NoteId, properties: NoteProperties): Promise<number>
  updateTitle(noteId: NoteId, title: string): Promise<number>
}

export function useActiveNoteViewModel(): ActiveNoteViewModel {
  const repository = useNoteRepository()
  const imageRepository = useImageRepository()
  const syncEngine = useSyncEngine()
  const activeNoteId = useAppUiStore((state) => state.activeNoteId)
  const setActiveNote = useAppUiStore((state) => state.setActiveNote)
  const liveQuery = useOwnedLiveQuery(
    () =>
      activeNoteId
        ? repository.liveNote(activeNoteId)
        : createStaticLiveQuery<NoteDetail | null>(null),
    [activeNoteId, repository],
  )
  const note = useLiveQuery(liveQuery)

  return {
    activeNoteId,
    note,
    setActiveNote,
    async updateDocument(noteId, document) {
      const localRevision = await repository.updateNote(noteId, { document })

      // Image GC rides the explicit save: unreferenced images get tombstoned,
      // referenced-but-tombstoned ones restored (undo). A GC failure must
      // never fail the save itself.
      if (imageRepository) {
        try {
          await imageRepository.reconcileNoteImages(
            noteId,
            collectImageIdsFromDocument(document),
          )
        } catch {
          // Swallowed on purpose; the next save retries the reconcile.
        }
      }

      syncEngine?.requestSync('outbox-change')

      // The revision of the note write, not of whatever the image reconcile
      // may have touched — it is the note the editor is comparing against.
      return localRevision
    },
    async updateProperties(noteId, properties) {
      const localRevision = await repository.updateNote(noteId, { properties })
      syncEngine?.requestSync('outbox-change')

      return localRevision
    },
    async updateTitle(noteId, title) {
      const localRevision = await repository.updateNote(noteId, { title })
      syncEngine?.requestSync('outbox-change')

      return localRevision
    },
  }
}
