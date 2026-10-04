import { useRef, useState } from 'react'
import type { FolderId, NoteId } from '@/shared/contracts'
import { useNoteRepository } from './repository-hooks'
import { useSyncEngine } from './sync-engine-hooks'

type Receipt = {
  kind: 'move' | 'trash'
  noteId: NoteId
  previousFolderId: FolderId | null
  destination: FolderId | null
}

/** One reversible receipt shared by dialog, drag/drop and trash actions. */
export function useNoteLocation() {
  const repository = useNoteRepository()
  const sync = useSyncEngine()
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  async function run(action: () => Promise<void>) {
    if (running.current) return false
    running.current = true
    setBusy(true)
    setError(false)
    try {
      await action()
      sync?.requestSync('outbox-change')
      return true
    } catch {
      setError(true)
      return false
    } finally {
      running.current = false
      setBusy(false)
    }
  }
  return {
    receipt, error, busy,
    dismiss: () => { setReceipt(null); setError(false) },
    move: (noteId: NoteId, destination: FolderId | null) => run(async () => {
      const note = await repository.getNote(noteId)
      if (!note || note.deletedAt) throw new Error('Note unavailable')
      await repository.moveNoteToFolder(noteId, destination)
      setReceipt({ kind: 'move', noteId, previousFolderId: note.parentFolderId, destination })
    }),
    trash: (noteId: NoteId) => run(async () => {
      const note = await repository.getNote(noteId)
      if (!note || note.deletedAt) throw new Error('Note unavailable')
      await repository.deleteNote(noteId)
      setReceipt({ kind: 'trash', noteId, previousFolderId: note.parentFolderId, destination: null })
    }),
    undo: () => run(async () => {
      if (!receipt) return
      const note = await repository.getNote(receipt.noteId)
      // A stale receipt must not overwrite a newer move or resurrect a purge.
      if (!note || (receipt.kind === 'move'
        ? note.deletedAt || note.parentFolderId !== receipt.destination
        : !note.deletedAt)) throw new Error('Location changed')
      if (receipt.kind === 'move') await repository.moveNoteToFolder(receipt.noteId, receipt.previousFolderId)
      else await repository.restoreNote(receipt.noteId)
      setReceipt(null)
    }),
  }
}
