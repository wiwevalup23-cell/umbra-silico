import { useEffect, useId, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import { useFolderExpansion } from './use-folder-expansion'
import type { FolderId, FolderTreeNode, NoteId } from '@/shared/contracts'
import { noteDragType } from '@/ui/components/notes/note-drag'
import { UiIcon } from '@/ui/icons/ui/UiIcon'
import { useTranslation } from '@/ui/i18n/use-translation'

type FolderTreeProps = {
  activeFolderId: FolderId | null | undefined
  nodes: FolderTreeNode[]
  onCreateFolder: (parentFolderId: FolderId | null) => void
  onDeleteFolder: (folderId: FolderId) => void
  onMoveFolder?: (folderId: FolderId) => void
  onMoveNoteToFolder: (noteId: NoteId, folderId: FolderId | null) => void
  onRenameFolder: (folderId: FolderId, currentName: string) => void
  onSelectFolder: (folderId: FolderId | null | undefined) => void
}

function readDraggedNoteId(event: DragEvent): NoteId | null {
  const value = event.dataTransfer.getData(noteDragType)
  return value ? (value as NoteId) : null
}

type FolderNodeProps = Omit<FolderTreeProps, 'nodes'> & {
  node: FolderTreeNode
  level: number
  expansion: ReturnType<typeof useFolderExpansion>
}

function FolderNode({
  activeFolderId,
  expansion,
  level,
  node,
  onCreateFolder,
  onDeleteFolder,
  onMoveFolder,
  onMoveNoteToFolder,
  onRenameFolder,
  onSelectFolder,
}: FolderNodeProps) {
  const { t } = useTranslation()
  const childrenId = useId()
  const isExpanded = expansion.isExpanded(node.folder.id)
  const [isActionsOpen, setActionsOpen] = useState(false)
  const [isDropTarget, setDropTarget] = useState(false)
  const actionsRef = useRef<HTMLDivElement>(null)
  const isActive = activeFolderId === node.folder.id
  const hasChildren = node.children.length > 0

  useEffect(() => {
    if (!isActionsOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) setActionsOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActionsOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isActionsOpen])

  return (
    <li>
      <div
        className="sn-folder-tree__row"
        data-active={isActive}
        data-drop-target={isDropTarget}
        data-expanded={isExpanded}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDropTarget(false)
          }
        }}
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          setDropTarget(true)
        }}
        onDrop={(event) => {
          const noteId = readDraggedNoteId(event)
          setDropTarget(false)

          if (noteId) {
            event.preventDefault()
            event.stopPropagation()
            onMoveNoteToFolder(noteId, node.folder.id)
          }
        }}
        style={{ '--sn-folder-level': level } as CSSProperties}
      >
        {hasChildren ? (
          <button
            aria-label={t(isExpanded ? 'library.collapseFolder' : 'library.expandFolder')}
            aria-expanded={isExpanded}
            aria-controls={childrenId}
            className="sn-folder-tree__twisty sn-tool"
            onClick={() => expansion.toggle(node.folder.id)}
            type="button"
          >
            <UiIcon className="sn-icon sn-icon--16" name="chevronRight" />
          </button>
        ) : <span className="sn-folder-tree__twisty-space" aria-hidden="true" />}
        <button
          className="sn-folder-tree__select"
          onClick={() => onSelectFolder(node.folder.id)}
          type="button"
        >
          <UiIcon className="sn-icon sn-icon--16" name="folder" />
          <span title={node.folder.name}>{node.folder.name}</span>
        </button>
        <span className="sn-folder-tree__count">{node.noteCount}</span>
        <div className="sn-folder-tree__actions" ref={actionsRef}>
          <button
            aria-expanded={isActionsOpen}
            aria-haspopup="menu"
            aria-label={t('library.folderActions', { name: node.folder.name })}
            className="sn-folder-tree__icon sn-tool"
            onClick={() => setActionsOpen((open) => !open)}
            type="button"
          >
            <UiIcon className="sn-icon sn-icon--16" name="moreHorizontal" />
          </button>
          {isActionsOpen ? (
            <div className="sn-folder-tree__menu sn-menu" role="menu">
              <button className="sn-menu-item" onClick={() => {
                setActionsOpen(false)
                onCreateFolder(node.folder.id)
              }} role="menuitem" type="button">
                <UiIcon className="sn-icon sn-icon--16" name="plus" />
                <span className="sn-menu-item__label">{t('library.newSubfolder')}</span>
              </button>
              <button className="sn-menu-item" onClick={() => {
                setActionsOpen(false)
                onRenameFolder(node.folder.id, node.folder.name)
              }} role="menuitem" type="button">
                <UiIcon className="sn-icon sn-icon--16" name="edit" />
                <span className="sn-menu-item__label">{t('library.renameFolder')}</span>
              </button>
              {onMoveFolder ? <button className="sn-menu-item" onClick={() => {
                setActionsOpen(false)
                onMoveFolder(node.folder.id)
              }} role="menuitem" type="button">
                <UiIcon className="sn-icon sn-icon--16" name="folder" />
                <span className="sn-menu-item__label">{t('folder.moveTitle')}</span>
              </button> : null}
              <div className="sn-menu__sep" role="separator" />
              <button className="sn-menu-item sn-menu-item--danger sn-folder-tree__menu-danger" onClick={() => {
                setActionsOpen(false)
                onDeleteFolder(node.folder.id)
              }} role="menuitem" type="button">
                <UiIcon className="sn-icon sn-icon--16" name="trash" />
                <span className="sn-menu-item__label">{t('library.deleteFolder')}</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {hasChildren && isExpanded ? (
        <ul className="sn-folder-tree__children" id={childrenId}>
          {node.children.map((child) => (
            <FolderNode
              activeFolderId={activeFolderId}
              expansion={expansion}
              onMoveFolder={onMoveFolder}
              key={child.folder.id}
              level={level + 1}
              node={child}
              onCreateFolder={onCreateFolder}
              onDeleteFolder={onDeleteFolder}
              onMoveNoteToFolder={onMoveNoteToFolder}
              onRenameFolder={onRenameFolder}
              onSelectFolder={onSelectFolder}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function FolderTree(props: FolderTreeProps) {
  const { t } = useTranslation()
  const folderListId = useId()
  const expansion = useFolderExpansion(props.nodes, props.activeFolderId)
  const isFolderListExpanded = expansion.isExpanded('root')
  const hasFolders = props.nodes.length > 0

  return (
    <nav className="sn-folder-tree" aria-label={t('library.folders')}>
      <div
        className="sn-folder-tree__root"
        data-active={props.activeFolderId === undefined}
        data-expanded={isFolderListExpanded}
      >
        {hasFolders ? (
          <button
            aria-controls={folderListId}
            aria-expanded={isFolderListExpanded}
            aria-label={t(
              isFolderListExpanded ? 'library.collapseFolders' : 'library.expandFolders',
            )}
            className="sn-folder-tree__twisty sn-tool"
            onClick={() => expansion.toggle('root')}
            type="button"
          >
            <UiIcon className="sn-icon sn-icon--16" name="chevronRight" />
          </button>
        ) : <span className="sn-folder-tree__twisty-space" aria-hidden="true" />}
        <button
          className="sn-folder-tree__root-select"
          onClick={() => props.onSelectFolder(undefined)}
          type="button"
        >
          <UiIcon className="sn-icon sn-icon--16" name="library" />
          {t('library.allNotes')}
        </button>
        <button
          aria-label={t('library.newRootFolder')}
          className="sn-folder-tree__icon sn-tool"
          onClick={() => props.onCreateFolder(null)}
          type="button"
        >
          <UiIcon className="sn-icon sn-icon--16" name="folderPlus" />
        </button>
      </div>
      <div
        className="sn-folder-tree__root"
        data-active={props.activeFolderId === null}
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
        }}
        onDrop={(event) => {
          const noteId = readDraggedNoteId(event)
          if (noteId) {
            event.preventDefault()
            props.onMoveNoteToFolder(noteId, null)
          }
        }}
      >
        <span className="sn-folder-tree__twisty-space" aria-hidden="true" />
        <button
          className="sn-folder-tree__root-select"
          onClick={() => props.onSelectFolder(null)}
          type="button"
        >
          <UiIcon className="sn-icon sn-icon--16" name="document" />
          {t('library.unfiled')}
        </button>
      </div>
      <ul className="sn-folder-tree__list" hidden={!isFolderListExpanded} id={folderListId}>
        {props.nodes.map((node) => (
          <FolderNode
            {...props}
            expansion={expansion}
            key={node.folder.id}
            level={0}
            node={node}
          />
        ))}
      </ul>
    </nav>
  )
}
