import { useMemo, useState } from 'react'
import type { NoteDetail, NoteId } from '@/shared/contracts'
import { useAppUiStore } from '@/viewmodel/app-ui-store'
import {
  createStaticLiveQuery,
  useLiveQuery,
} from '@/viewmodel/live-query-view-model'
import { useNoteRepository } from '@/viewmodel/repository-hooks'
import { useSyncEngine } from '@/viewmodel/sync-engine-hooks'

export type LockModalMode = 'lock' | 'unlock'

export type LockModalViewModel = {
  close(): void
  error: string | null
  isOpen: boolean
  isPending: boolean
  mode: LockModalMode
  note: NoteDetail | null
  noteId: NoteId | null
  submit(masterPassword: string): Promise<void>
}

export function useLockModalViewModel(): LockModalViewModel {
  const repository = useNoteRepository()
  const syncEngine = useSyncEngine()
  const noteId = useAppUiStore((state) => state.lockModalNoteId)
  const closeLockModal = useAppUiStore((state) => state.closeLockModal)
  const setActiveNote = useAppUiStore((state) => state.setActiveNote)
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const liveQuery = useMemo(
    () =>
      noteId
        ? repository.liveNote(noteId)
        : createStaticLiveQuery<NoteDetail | null>(null),
    [noteId, repository],
  )
  const note = useLiveQuery(liveQuery)
  const mode: LockModalMode = note?.isLocked ? 'unlock' : 'lock'

  return {
    close() {
      setError(null)
      closeLockModal()
    },
    error,
    isOpen: noteId !== null,
    isPending,
    mode,
    note,
    noteId,
    async submit(masterPassword) {
      if (!noteId || isPending) {
        return
      }

      setError(null)
      setIsPending(true)

      try {
        if (mode === 'unlock') {
          await repository.unlockNoteForSession(noteId, { masterPassword })
          setActiveNote(noteId)
        } else {
          await repository.lockNote(noteId, { masterPassword })
          syncEngine?.requestSync('outbox-change')
        }

        closeLockModal()
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : 'Unable to update locked note state.',
        )
      } finally {
        setIsPending(false)
      }
    },
  }
}
