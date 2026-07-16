import { useMemo, useRef, type CSSProperties } from 'react'
import type { FolderId, FolderTreeNode } from '@/shared/contracts'
import { RetroDialogShell } from '@/ui/components/silicon'
import { UiIcon } from '@/ui/icons/ui/UiIcon'

type FolderLocation = {
  depth: number
  id: FolderId | null
  name: string
}

function flattenFolders(nodes: FolderTreeNode[], depth = 0): FolderLocation[] {
  return nodes.flatMap((node) => [
    { depth, id: node.folder.id, name: node.folder.name },
    ...flattenFolders(node.children, depth + 1),
  ])
}

type MoveToFolderDialogProps = {
  currentFolderId: FolderId | null
  folders: FolderTreeNode[]
  noteTitle: string
  onCancel: () => void
  onMove: (folderId: FolderId | null) => void
}

export function MoveToFolderDialog({
  currentFolderId,
  folders,
  noteTitle,
  onCancel,
  onMove,
}: MoveToFolderDialogProps) {
  const firstLocationRef = useRef<HTMLButtonElement>(null)
  const locations = useMemo<FolderLocation[]>(
    () => [{ depth: 0, id: null, name: 'All notes' }, ...flattenFolders(folders)],
    [folders],
  )
  const firstAvailableIndex = locations.findIndex(
    (location) => location.id !== currentFolderId,
  )

  return (
    <RetroDialogShell
      className="sn-modal--move"
      describedBy="sn-move-folder-description"
      initialFocusRef={firstLocationRef}
      labelledBy="sn-move-folder-title"
      onClose={onCancel}
      title="Move note"
    >
      <div className="sn-move-folder-dialog">
        <div className="sn-move-folder-dialog__intro">
          <h3 id="sn-move-folder-title">Choose a folder</h3>
          <p id="sn-move-folder-description">Move “{noteTitle || 'Untitled'}” to another location.</p>
        </div>
        <div className="sn-move-folder-list" role="listbox" aria-label="Folder destination">
          {locations.map((location, index) => (
            <button
              aria-selected={location.id === currentFolderId}
              disabled={location.id === currentFolderId}
              key={location.id ?? 'all-notes'}
              onClick={() => onMove(location.id)}
              ref={index === firstAvailableIndex ? firstLocationRef : undefined}
              role="option"
              style={{ '--sn-folder-depth': location.depth } as CSSProperties}
              type="button"
            >
              <UiIcon name={location.id ? 'folder' : 'home'} />
              <span>{location.name}</span>
              {location.id === currentFolderId ? <UiIcon name="check" /> : null}
            </button>
          ))}
        </div>
      </div>
    </RetroDialogShell>
  )
}
