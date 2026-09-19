import { create } from 'zustand'
import type { FolderId, NoteId } from '@/shared/contracts'

export type SyncBadge = 'offline' | 'idle' | 'syncing' | 'conflict' | 'error'

type AppUiState = {
  /** undefined: all notes; null: unfiled; FolderId: one folder. */
  activeFolderId: FolderId | null | undefined
  activeNoteId: NoteId | null
  lockModalNoteId: NoteId | null
  openWindows: string[]
  syncBadge: SyncBadge
  closeLockModal: () => void
  openLockModal: (noteId: NoteId) => void
  setActiveFolder: (folderId: FolderId | null | undefined) => void
  setActiveNote: (noteId: NoteId | null) => void
  setSyncBadge: (status: SyncBadge) => void
}

export const useAppUiStore = create<AppUiState>((set) => ({
  activeFolderId: undefined,
  activeNoteId: null,
  lockModalNoteId: null,
  openWindows: ['workspace'],
  syncBadge: 'idle',
  closeLockModal: () => set({ lockModalNoteId: null }),
  openLockModal: (noteId) => set({ lockModalNoteId: noteId }),
  setActiveFolder: (activeFolderId) => set({ activeFolderId }),
  setActiveNote: (noteId) => set({ activeNoteId: noteId }),
  setSyncBadge: (syncBadge) => set({ syncBadge }),
}))
