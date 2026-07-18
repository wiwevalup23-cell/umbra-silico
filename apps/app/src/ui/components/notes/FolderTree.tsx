import { useEffect, useId, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import type { FolderId, FolderTreeNode, NoteId } from '@/shared/contracts'
import { noteDragType } from '@/ui/components/notes/note-drag'
import { UiIcon } from '@/ui/icons/ui/UiIcon'

type FolderTreeProps = {
  activeFolderId: FolderId | null
  nodes: FolderTreeNode[]
  onCreateFolder: (parentFolderId: FolderId | null) => void
  onDeleteFolder: (folderId: FolderId) => void
  onMoveNoteToFolder: (noteId: NoteId, folderId: FolderId | null) => void
  onRenameFolder: (folderId: FolderId, currentName: string) => void
  onSelectFolder: (folderId: FolderId | null) => void
}

function readDraggedNoteId(event: DragEvent): NoteId | null {
  const value = event.dataTransfer.getData(noteDragType)
  return value ? (value as NoteId) : null
}

type FolderNodeProps = Omit<FolderTreeProps, 'nodes'> & {
  node: FolderTreeNode
  level: number
}

function FolderNode({
  activeFolderId,
  level,
  node,
  onCreateFolder,
  onDeleteFolder,
  onMoveNoteToFolder,
  onRenameFolder,
  onSelectFolder,
}: FolderNodeProps) {
  const [isExpanded, setExpanded] = useState(true)
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
            aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
            className="sn-folder-tree__twisty"
            onClick={() => setExpanded((expanded) => !expanded)}
            type="button"
          >
            <UiIcon name="chevronRight" />
          </button>
        ) : <span className="sn-folder-tree__twisty-space" aria-hidden="true" />}
        <button
          className="sn-folder-tree__select"
          onClick={() => onSelectFolder(node.folder.id)}
          type="button"
        >
          <UiIcon name="folder" />
          <span>{node.folder.name}</span>
        </button>
        <span className="sn-folder-tree__count">{node.noteCount}</span>
        <div className="sn-folder-tree__actions" ref={actionsRef}>
          <button
            aria-expanded={isActionsOpen}
            aria-haspopup="menu"
            aria-label={`Actions for ${node.folder.name}`}
            className="sn-folder-tree__icon"
            onClick={() => setActionsOpen((open) => !open)}
            type="button"
          >
            <UiIcon name="moreHorizontal" />
          </button>
          {isActionsOpen ? (
            <div className="sn-folder-tree__menu" role="menu">
              <button onClick={() => {
                setActionsOpen(false)
                onCreateFolder(node.folder.id)
              }} role="menuitem" type="button">
                <UiIcon name="plus" /> New subfolder
              </button>
              <button onClick={() => {
                setActionsOpen(false)
                onRenameFolder(node.folder.id, node.folder.name)
              }} role="menuitem" type="button">
                <UiIcon name="edit" /> Rename
              </button>
              <button className="sn-folder-tree__menu-danger" onClick={() => {
                setActionsOpen(false)
                onDeleteFolder(node.folder.id)
              }} role="menuitem" type="button">
                <UiIcon name="trash" /> Delete folder
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {hasChildren && isExpanded ? (
        <ul className="sn-folder-tree__children">
          {node.children.map((child) => (
            <FolderNode
              activeFolderId={activeFolderId}
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
  const folderListId = useId()
  const [isFolderListExpanded, setFolderListExpanded] = useState(true)
  const hasFolders = props.nodes.length > 0

  return (
    <nav className="sn-folder-tree" aria-label="Folders">
      <div
        className="sn-folder-tree__root"
        data-active={props.activeFolderId === null}
        data-expanded={isFolderListExpanded}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          const noteId = readDraggedNoteId(event)

          if (noteId) {
            event.preventDefault()
            props.onMoveNoteToFolder(noteId, null)
          }
        }}
      >
        {hasFolders ? (
          <button
            aria-controls={folderListId}
            aria-expanded={isFolderListExpanded}
            aria-label={isFolderListExpanded ? 'Collapse folders' : 'Expand folders'}
            className="sn-folder-tree__twisty"
            onClick={() => setFolderListExpanded((expanded) => !expanded)}
            type="button"
          >
            <UiIcon name="chevronRight" />
          </button>
        ) : <span className="sn-folder-tree__twisty-space" aria-hidden="true" />}
        <button
          className="sn-folder-tree__root-select"
          onClick={() => props.onSelectFolder(null)}
          type="button"
        >
          <UiIcon name="library" />
          All notes
        </button>
        <button
          aria-label="New root folder"
          className="sn-folder-tree__icon"
          onClick={() => props.onCreateFolder(null)}
          type="button"
        >
          <UiIcon name="folderPlus" />
        </button>
      </div>
      <ul className="sn-folder-tree__list" hidden={!isFolderListExpanded} id={folderListId}>
        {props.nodes.map((node) => (
          <FolderNode
            {...props}
            key={node.folder.id}
            level={0}
            node={node}
          />
        ))}
      </ul>
    </nav>
  )
}
