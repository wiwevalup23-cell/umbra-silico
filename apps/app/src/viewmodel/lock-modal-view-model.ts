import { useMemo, useState } from 'react'
import type { NoteDetail, NoteId } from '@/shared/contracts'
import { useAppUiStore } from '@/viewmodel/app-ui-store'
import {
  createStaticLiveQuery,
  useLiveQuery,
} from '@/viewmodel/live-query-view-model'
import { useImageRepository, useNoteRepository } from '@/viewmodel/repository-hooks'
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
  const imageRepository = useImageRepository()
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

          // Self-heal: a previous lock that crashed mid-way may have left
          // plaintext image tiers behind; finish encrypting them now that the
          // master key is cached. Never fatal for the unlock itself.
          try {
            await imageRepository?.unlockSweep(noteId)
          } catch {
            // The next unlock retries the sweep.
          }

          setActiveNote(noteId)
        } else {
          const credentials = { masterPassword }

          // Ciphertext for every attachment is made durable before the note
          // lock is published. If the note write fails, plaintext remains the
          // active representation and the preparation is rolled back.
          await imageRepository?.prepareNoteImagesLock(noteId, credentials)

          try {
            await repository.lockNote(noteId, credentials)
          } catch (error) {
            await imageRepository?.rollbackPreparedNoteImagesLock(noteId)
            throw error
          }

          // Promotion uses a transaction/rename and is restart-recoverable:
          // repository boot completes an interruption after the note write.
          await imageRepository?.commitPreparedNoteImagesLock(noteId)
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
