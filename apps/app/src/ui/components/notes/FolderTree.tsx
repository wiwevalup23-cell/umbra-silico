import { useState, type CSSProperties, type DragEvent } from 'react'
import type { FolderId, FolderTreeNode, NoteId } from '@/shared/contracts'
import { noteDragType } from '@/ui/components/notes/note-drag'
import { UiIcon } from '@/ui/icons/ui/UiIcon'

type FolderTreeProps = {
  activeFolderId: FolderId | null
  nodes: FolderTreeNode[]
  onCreateFolder: (parentFolderId: FolderId | null) => void
  onDeleteFolder: (folderId: FolderId) => void
  onMoveNoteToFolder: (noteId: NoteId, folderId: FolderId | null) => void
  onRenameFolder: (folderId: FolderId, name: string) => void
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
  const [isRenaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(node.folder.name)
  const isActive = activeFolderId === node.folder.id
  const hasChildren = node.children.length > 0

  function commitRename() {
    const nextName = draftName.trim()

    setRenaming(false)

    if (nextName && nextName !== node.folder.name) {
      onRenameFolder(node.folder.id, nextName)
    } else {
      setDraftName(node.folder.name)
    }
  }

  return (
    <li>
      <div
        className="sn-folder-tree__row"
        data-active={isActive}
        data-expanded={isExpanded}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          const noteId = readDraggedNoteId(event)

          if (noteId) {
            event.preventDefault()
            onMoveNoteToFolder(noteId, node.folder.id)
          }
        }}
        style={{ '--sn-folder-level': level } as CSSProperties}
      >
        <button
          aria-label={hasChildren ? 'Toggle folder' : 'Folder'}
          className="sn-folder-tree__twisty"
          disabled={!hasChildren}
          onClick={() => setExpanded((expanded) => !expanded)}
          type="button"
        >
          <UiIcon name={isExpanded ? 'chevronRight' : 'chevronRight'} />
        </button>
        <button
          className="sn-folder-tree__select"
          onClick={() => onSelectFolder(node.folder.id)}
          type="button"
        >
          <UiIcon name="folder" />
          {isRenaming ? (
            <input
              aria-label="Folder name"
              autoFocus
              onBlur={commitRename}
              onChange={(event) => setDraftName(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  commitRename()
                }
                if (event.key === 'Escape') {
                  setDraftName(node.folder.name)
                  setRenaming(false)
                }
              }}
              value={draftName}
            />
          ) : (
            <span>{node.folder.name}</span>
          )}
        </button>
        <span className="sn-folder-tree__count">{node.noteCount}</span>
        <button
          aria-label="New subfolder"
          className="sn-folder-tree__icon"
          onClick={() => onCreateFolder(node.folder.id)}
          type="button"
        >
          <UiIcon name="plus" />
        </button>
        <button
          aria-label="Rename folder"
          className="sn-folder-tree__icon"
          onClick={() => setRenaming(true)}
          type="button"
        >
          <UiIcon name="settings" />
        </button>
        <button
          aria-label="Delete folder"
          className="sn-folder-tree__icon"
          onClick={() => onDeleteFolder(node.folder.id)}
          type="button"
        >
          <UiIcon name="trash" />
        </button>
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
  return (
    <nav className="sn-folder-tree" aria-label="Folders">
      <div
        className="sn-folder-tree__root"
        data-active={props.activeFolderId === null}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          const noteId = readDraggedNoteId(event)

          if (noteId) {
            event.preventDefault()
            props.onMoveNoteToFolder(noteId, null)
          }
        }}
      >
        <button onClick={() => props.onSelectFolder(null)} type="button">
          <UiIcon name="home" />
          Root
        </button>
        <button
          aria-label="New root folder"
          className="sn-folder-tree__icon"
          onClick={() => props.onCreateFolder(null)}
          type="button"
        >
          <UiIcon name="plus" />
        </button>
      </div>
      <ul className="sn-folder-tree__list">
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
