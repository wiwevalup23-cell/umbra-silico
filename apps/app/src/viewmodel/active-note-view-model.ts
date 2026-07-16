import { useMemo } from 'react'
import type { NoteDetail, NoteDocument, NoteId, NoteProperties } from '@/shared/contracts'
import { useAppUiStore } from '@/viewmodel/app-ui-store'
import {
  createStaticLiveQuery,
  useLiveQuery,
} from '@/viewmodel/live-query-view-model'
import { useNoteRepository } from '@/viewmodel/repository-hooks'
import { useSyncEngine } from '@/viewmodel/sync-engine-hooks'

export type ActiveNoteViewModel = {
  activeNoteId: NoteId | null
  note: NoteDetail | null
  setActiveNote(noteId: NoteId | null): void
  updateDocument(noteId: NoteId, document: NoteDocument): Promise<void>
  updateProperties(noteId: NoteId, properties: NoteProperties): Promise<void>
  updateTitle(noteId: NoteId, title: string): Promise<void>
}

export function useActiveNoteViewModel(): ActiveNoteViewModel {
  const repository = useNoteRepository()
  const syncEngine = useSyncEngine()
  const activeNoteId = useAppUiStore((state) => state.activeNoteId)
  const setActiveNote = useAppUiStore((state) => state.setActiveNote)
  const liveQuery = useMemo(
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
      await repository.updateNote(noteId, { document })
      syncEngine?.requestSync('outbox-change')
    },
    async updateProperties(noteId, properties) {
      await repository.updateNote(noteId, { properties })
      syncEngine?.requestSync('outbox-change')
    },
    async updateTitle(noteId, title) {
      await repository.updateNote(noteId, { title })
      syncEngine?.requestSync('outbox-change')
    },
  }
}
