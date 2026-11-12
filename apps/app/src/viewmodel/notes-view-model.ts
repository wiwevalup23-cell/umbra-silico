import { useMemo, useState } from 'react'
import { searchDebounceMs, useDebouncedValue } from '@/viewmodel/use-debounced-value'
import type { NoteRepository } from '@/repository/contracts'
import {
  noteListQuerySchema,
  type CreateNoteInput,
  type NoteId,
  type NoteListQuery,
} from '@/shared/contracts'
import { useAppUiStore } from '@/viewmodel/app-ui-store'
import { useLiveQuery, useLiveQueryLoading, useOwnedLiveQuery } from '@/viewmodel/live-query-view-model'
import { useNoteRepository } from '@/viewmodel/repository-hooks'
import { useSyncEngine } from '@/viewmodel/sync-engine-hooks'

export type NotesViewModelDependencies = {
  noteRepository: NoteRepository
}

export function createNotesViewModelDependencies(
  noteRepository: NoteRepository,
): NotesViewModelDependencies {
  return { noteRepository }
}

export type NotesViewModel = {
  activeNoteId: NoteId | null
  createNote(input?: CreateNoteInput): Promise<NoteId>
  deleteNote(noteId: NoteId): Promise<void>
  isEmpty: boolean
  isLoading: boolean
  notes: ReturnType<NoteRepository['liveNoteList']> extends {
    getSnapshot(): infer TValue
  }
    ? TValue
    : never
  openLockModal(noteId: NoteId): void
  selectNote(noteId: NoteId | null): void
}

export function useNotesViewModel(query: NoteListQuery = {}): NotesViewModel {
  const repository = useNoteRepository()
  const syncEngine = useSyncEngine()
  const activeNoteId = useAppUiStore((state) => state.activeNoteId)
  const setActiveNote = useAppUiStore((state) => state.setActiveNote)
  const openLockModal = useAppUiStore((state) => state.openLockModal)
  const parsedQuery = noteListQuerySchema.parse(query)
  const folderId = parsedQuery.folderId
  const includeDeleted = parsedQuery.includeDeleted ?? false
  const search = parsedQuery.search ?? ''
  const liveQueryInput = useMemo(
    () => ({
      folderId,
      includeDeleted,
      search: search || undefined,
    }),
    [folderId, includeDeleted, search],
  )
  const liveQuery = useOwnedLiveQuery(
    () => repository.liveNoteList(liveQueryInput),
    [repository, liveQueryInput],
  )
  const notes = useLiveQuery(liveQuery)
  const isLoading = useLiveQueryLoading(liveQuery)

  return {
    activeNoteId,
    async createNote(input = {}) {
      const noteId = await repository.createNote(input)
      setActiveNote(noteId)
      syncEngine?.requestSync('outbox-change')
      return noteId
    },
    async deleteNote(noteId) {
      await repository.deleteNote(noteId)
      syncEngine?.requestSync('outbox-change')

      if (activeNoteId === noteId) {
        setActiveNote(null)
      }
    },
    isEmpty: !isLoading && notes.length === 0,
    isLoading,
    notes,
    openLockModal,
    selectNote: setActiveNote,
  }
}


/** Keeps the input immediate while store scans trail typing. Clearing bypasses
 * the debounce so an old non-matching query cannot keep the library hidden. */
export function useNotesSearchViewModel(query: Omit<NoteListQuery, 'search'> = {}) {
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearch = useDebouncedValue(searchQuery, searchDebounceMs)
  const notes = useNotesViewModel({
    ...query,
    search: searchQuery.trim() ? debouncedSearch : '',
  })
  return {
    ...notes,
    searchQuery,
    setSearchQuery,
    isSearchPending: notes.isLoading || (
      Boolean(searchQuery.trim()) && searchQuery !== debouncedSearch
    ),
  }
}
