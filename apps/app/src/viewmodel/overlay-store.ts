import { create } from 'zustand'
import type { FolderId, NoteId } from '@/shared/contracts'

/**
 * Which modal surface the workspace is showing.
 *
 * Every one of these is modal, so at most one can be open — a union says that,
 * where eight independent booleans only implied it and let the workspace drift
 * into states like "templates and settings both open". The lock modal is not
 * here: it is driven by the note being locked, not by a UI intent.
 */
export type WorkspaceOverlay =
  | { kind: 'none' }
  | { kind: 'settings' }
  | { kind: 'quickSwitcher' }
  | { kind: 'templates' }
  | { kind: 'telegramImport' }
  | { kind: 'history' }
  | { kind: 'createFolder'; parentFolderId: FolderId | null }
  | { kind: 'renameFolder'; folderId: FolderId; currentName: string }
  | { kind: 'deleteFolder'; folderId: FolderId; name: string }
  | { kind: 'moveNote'; noteId: NoteId }

export type OverlayKind = WorkspaceOverlay['kind']

type OverlayState = {
  overlay: WorkspaceOverlay
  close: () => void
  open: (overlay: WorkspaceOverlay) => void
  toggle: (overlay: WorkspaceOverlay) => void
}

const closed: WorkspaceOverlay = { kind: 'none' }

export const useOverlayStore = create<OverlayState>((set) => ({
  overlay: closed,
  close: () => set({ overlay: closed }),
  open: (overlay) => set({ overlay }),
  toggle: (overlay) =>
    set((state) => ({
      overlay: state.overlay.kind === overlay.kind ? closed : overlay,
    })),
}))

/** Subscribes to the open overlay. Only the dialog host should use this. */
export function useWorkspaceOverlay(): WorkspaceOverlay {
  return useOverlayStore((state) => state.overlay)
}

/**
 * The stable actions. Reading these instead of the overlay itself is what
 * keeps opening a dialog from re-rendering the whole workspace.
 */
export function useOverlayActions(): Pick<OverlayState, 'close' | 'open' | 'toggle'> {
  const close = useOverlayStore((state) => state.close)
  const open = useOverlayStore((state) => state.open)
  const toggle = useOverlayStore((state) => state.toggle)

  return { close, open, toggle }
}
