import { useMemo, useRef, useState, type CSSProperties } from 'react'
import type { FolderId, FolderTreeNode } from '@/shared/contracts'
import { RetroDialogShell } from '@/ui/components/silicon'
import { UiIcon } from '@/ui/icons/ui/UiIcon'
import { useTranslation } from '@/ui/i18n/use-translation'

type FolderLocation = {
  depth: number
  id: FolderId | null
  name: string
}

function flattenFolders(nodes: FolderTreeNode[], depth = 0, path: string[] = [], excluded?: FolderId): FolderLocation[] {
  return nodes.filter((node) => node.folder.id !== excluded).flatMap((node) => [
    { depth, id: node.folder.id, name: [...path, node.folder.name].join(' / ') },
    ...flattenFolders(node.children, depth + 1, [...path, node.folder.name], excluded),
  ])
}

type MoveToFolderDialogProps = {
  currentFolderId: FolderId | null
  folders: FolderTreeNode[]
  movingFolderId?: FolderId
  noteTitle: string
  onCancel: () => void
  onMove: (folderId: FolderId | null) => void | Promise<void>
}

export function MoveToFolderDialog({
  currentFolderId,
  folders,
  movingFolderId,
  noteTitle,
  onCancel,
  onMove,
}: MoveToFolderDialogProps) {
  const { t } = useTranslation()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const firstLocationRef = useRef<HTMLButtonElement>(null)
  const locations = useMemo<FolderLocation[]>(
    () => [{ depth: 0, id: null, name: t(movingFolderId ? 'folder.root' : 'library.unfiled') }, ...flattenFolders(folders, 0, [], movingFolderId)],
    [folders, movingFolderId, t],
  )
  const firstAvailableIndex = locations.findIndex(
    (location) => location.id !== currentFolderId,
  )

  return (
    <RetroDialogShell
      className="sn-modal--move"
      closeDisabled={pending}
      describedBy="sn-move-folder-description"
      initialFocusRef={firstLocationRef}
      labelledBy="sn-move-folder-title"
      onClose={onCancel}
      title={t(movingFolderId ? 'folder.moveTitle' : 'move.title')}
    >
      <div className="sn-move-folder-dialog">
        <div className="sn-move-folder-dialog__intro">
          <h3>{t('move.heading')}</h3>
          <p id="sn-move-folder-description">
            {t('move.description', { title: noteTitle || t('note.untitled') })}
          </p>
        </div>
        <div className="sn-move-folder-list" role="group" aria-label={t('inspector.folder')}>
          {locations.map((location, index) => (
            <button
              aria-current={location.id === currentFolderId ? 'location' : undefined}
              disabled={pending || location.id === currentFolderId}
              key={location.id ?? 'all-notes'}
              onClick={async () => {
                setPending(true)
                setError(false)
                try { await onMove(location.id) } catch { setError(true) }
                finally { setPending(false) }
              }}
              ref={index === firstAvailableIndex ? firstLocationRef : undefined}
              style={{ '--sn-folder-depth': location.depth } as CSSProperties}
              type="button"
            >
              <UiIcon name={location.id ? 'folder' : 'home'} />
              <span>{location.name}</span>
              {location.id === currentFolderId ? <UiIcon name="check" /> : null}
            </button>
          ))}
        </div>
        {error ? <p role="alert">{t('move.failed')}</p> : null}
      </div>
    </RetroDialogShell>
  )
}
