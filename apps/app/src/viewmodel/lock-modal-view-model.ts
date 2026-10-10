import { useState } from 'react'
import {
  InvalidVaultCredentialError,
  type NoteDetail,
  type NoteId,
} from '@/shared/contracts'
import { useAppUiStore } from '@/viewmodel/app-ui-store'
import {
  createStaticLiveQuery,
  useLiveQuery,
  useOwnedLiveQuery,
} from '@/viewmodel/live-query-view-model'
import { useImageRepository, useNoteRepository } from '@/viewmodel/repository-hooks'
import { useSyncEngine } from '@/viewmodel/sync-engine-hooks'

export type LockModalMode = 'lock' | 'unlock'

export type LockModalCredentials = {
  masterPassword?: string
  recoveryKey?: string
}

/**
 * What went wrong, in terms the person can act on; the UI words it.
 *
 * `detail` keeps the underlying message for diagnostics. It is never the text
 * shown on its own: some engines leave it empty, and it is not localised.
 */
export type LockModalError = {
  kind: 'wrong-password' | 'wrong-recovery-key' | 'failed'
  detail: string | null
}

function describeLockModalError(error: unknown): LockModalError {
  if (error instanceof InvalidVaultCredentialError) {
    return {
      kind: error.credential === 'recovery-key' ? 'wrong-recovery-key' : 'wrong-password',
      detail: error.message,
    }
  }

  return {
    kind: 'failed',
    detail: error instanceof Error && error.message ? error.message : null,
  }
}

export type LockModalViewModel = {
  acknowledgeRecoveryKey(): void
  close(): void
  error: LockModalError | null
  isOpen: boolean
  isPending: boolean
  mode: LockModalMode
  note: NoteDetail | null
  noteId: NoteId | null
  /** Non-null only between the vault-creating lock and its acknowledgement. */
  recoveryKey: string | null
  submit(credentials: LockModalCredentials): Promise<void>
}

export function useLockModalViewModel(): LockModalViewModel {
  const repository = useNoteRepository()
  const imageRepository = useImageRepository()
  const syncEngine = useSyncEngine()
  const noteId = useAppUiStore((state) => state.lockModalNoteId)
  const closeLockModal = useAppUiStore((state) => state.closeLockModal)
  const setActiveNote = useAppUiStore((state) => state.setActiveNote)
  const [error, setError] = useState<LockModalError | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const liveQuery = useOwnedLiveQuery(
    () =>
      noteId
        ? repository.liveNote(noteId)
        : createStaticLiveQuery<NoteDetail | null>(null),
    [noteId, repository],
  )
  const note = useLiveQuery(liveQuery)
  const mode: LockModalMode = note?.isLocked ? 'unlock' : 'lock'

  return {
    acknowledgeRecoveryKey() {
      setRecoveryKey(null)

      // A key can be shown for a lock that then failed (see `submit`). The
      // dialog stays open on the form so the failure is still reported.
      if (!error) {
        closeLockModal()
      }
    },
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
    recoveryKey,
    async submit(credentials) {
      if (!noteId || isPending) {
        return
      }

      setError(null)
      setIsPending(true)

      // Whichever step first meets an empty device creates the vault and is
      // handed its recovery key — today that is the image preparation, which
      // runs before the note lock. The key exists only in this variable, so it
      // is kept even if a later step fails.
      let createdRecoveryKey: string | null = null

      try {
        if (mode === 'unlock') {
          await repository.unlockNoteForSession(noteId, credentials)

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
          if (!credentials.masterPassword) {
            throw new Error('Locking a note requires a master password.')
          }

          const lockCredentials = { masterPassword: credentials.masterPassword }

          // Ciphertext for every attachment is made durable before the note
          // lock is published. If the note write fails, plaintext remains the
          // active representation and the preparation is rolled back.
          const prepared = await imageRepository?.prepareNoteImagesLock(
            noteId,
            lockCredentials,
          )
          createdRecoveryKey = prepared?.recoveryKey ?? null
          let lockResult: { recoveryKey: string | null }

          try {
            lockResult = await repository.lockNote(noteId, lockCredentials)
          } catch (error) {
            await imageRepository?.rollbackPreparedNoteImagesLock(noteId)
            throw error
          }

          // Promotion uses a transaction/rename and is restart-recoverable:
          // repository boot completes an interruption after the note write.
          await imageRepository?.commitPreparedNoteImagesLock(noteId)
          syncEngine?.requestSync('outbox-change')

          createdRecoveryKey ??= lockResult.recoveryKey

          // A vault was just created. Hold the modal open on the key panel
          // instead of closing, because this is the only time it can be read.
          if (createdRecoveryKey) {
            setRecoveryKey(createdRecoveryKey)
            return
          }
        }

        closeLockModal()
      } catch (submitError) {
        setError(describeLockModalError(submitError))

        // The vault outlives the failed lock, so this is still the only moment
        // its key can be read. Show it first; the error waits behind it.
        if (createdRecoveryKey) {
          setRecoveryKey(createdRecoveryKey)
        }
      } finally {
        setIsPending(false)
      }
    },
  }
}
