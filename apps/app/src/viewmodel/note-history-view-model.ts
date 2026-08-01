import { useCallback, useEffect, useState } from 'react'
import type { NoteId, NoteVersion } from '@/shared/contracts'
import { useNoteRepository } from '@/viewmodel/repository-hooks'

export type NoteHistoryViewModel = {
  error: string | null
  isLoading: boolean
  isRestoring: boolean
  versions: NoteVersion[]
  restore(opId: string): Promise<void>
}

/**
 * Reads a note's retained versions on demand. History is not a live query:
 * it is only opened deliberately, and refreshing it on every keystroke-driven
 * save would put the whole op log back into the hot path.
 */
export function useNoteHistoryViewModel(noteId: NoteId | null): NoteHistoryViewModel {
  const repository = useNoteRepository()
  const [versions, setVersions] = useState<NoteVersion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (targetNoteId: NoteId, signal: { cancelled: boolean }) => {
      setIsLoading(true)
      setError(null)

      try {
        const loaded = await repository.listNoteVersions(targetNoteId)

        if (!signal.cancelled) {
          setVersions(loaded)
        }
      } catch (loadError) {
        if (!signal.cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Could not read history.')
        }
      } finally {
        if (!signal.cancelled) {
          setIsLoading(false)
        }
      }
    },
    [repository],
  )

  useEffect(() => {
    if (!noteId) {
      setVersions([])
      return undefined
    }

    const signal = { cancelled: false }
    void load(noteId, signal)

    return () => {
      signal.cancelled = true
    }
  }, [load, noteId])

  const restore = useCallback(
    async (opId: string) => {
      if (!noteId) return

      setIsRestoring(true)
      setError(null)

      try {
        await repository.restoreNoteVersion(noteId, opId)
        await load(noteId, { cancelled: false })
      } catch (restoreError) {
        setError(
          restoreError instanceof Error ? restoreError.message : 'Could not restore version.',
        )
      } finally {
        setIsRestoring(false)
      }
    },
    [load, noteId, repository],
  )

  return { error, isLoading, isRestoring, restore, versions }
}
