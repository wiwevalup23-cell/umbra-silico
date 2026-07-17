import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import type { NoteId, NoteListItem } from '@/shared/contracts/note'
import { UiIcon } from '@/ui/icons/ui/UiIcon'
import { getPropertyStatusPresentation } from '@/ui/note-property-presentation'

type NoteCardProps = {
  active?: boolean
  index?: number
  draggable?: boolean
  note: NoteListItem
  onDelete?: (noteId: NoteId) => void
  onDragStart?: (noteId: NoteId, event: DragEvent<HTMLDivElement>) => void
  onMove?: (noteId: NoteId) => void
  onSelect?: () => void
}

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: 'short',
})

// 'dirty' is intentionally absent: in the local-first flow it only means
// "not replicated to a remote yet" while the note is already persisted on
// disk, so surfacing it as "Unsaved" would misinform the user.
const exceptionalSyncStatusLabels: Record<string, string> = {
  conflict: 'Review needed',
  error: 'Review needed',
  saving: 'Saving',
  syncing: 'Saving',
}

function formatUpdatedAt(updatedAt: string): string {
  const date = new Date(updatedAt)

  if (Number.isNaN(date.getTime())) {
    return '--'
  }

  return timeFormatter.format(date)
}

function formatSyncStatus(status: string): string {
  return exceptionalSyncStatusLabels[status] ?? ''
}

export function NoteCard({
  active = false,
  draggable = false,
  index = 0,
  note,
  onDelete,
  onDragStart,
  onMove,
  onSelect,
}: NoteCardProps) {
  const actionsRef = useRef<HTMLDivElement>(null)
  const [isActionsOpen, setActionsOpen] = useState(false)
  const title = note.title.trim()
  const isUntitled = title.length === 0 || title.toLocaleLowerCase() === 'untitled'
  const displayTitle = isUntitled ? 'Untitled' : title
  const actionLabel = note.isLocked ? `Unlock ${displayTitle}` : `Open ${displayTitle}`
  const syncStatus = formatSyncStatus(note.syncStatus)
  const shouldShowSyncStatus = syncStatus.length > 0
  const preview = note.isLocked ? 'Encrypted local note' : note.preview.trim()
  const shouldShowPreview = preview.length > 0
  const pageStatus = getPropertyStatusPresentation(note.propertyStatus)
  const shouldShowPageStatus = !note.isLocked && pageStatus.value !== 'none'
  const visibleTags = note.isLocked ? [] : note.tags?.slice(0, 2) ?? []
  const hiddenTagCount = Math.max(0, (note.tags?.length ?? 0) - visibleTags.length)

  useEffect(() => {
    if (!isActionsOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) {
        setActionsOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActionsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isActionsOpen])

  return (
    <div
      className="sn-note-card-wrap"
      draggable={draggable}
      onDragStart={(event) => onDragStart?.(note.id, event)}
      style={{ '--sn-note-index': index } as CSSProperties}
    >
      <button
        aria-label={actionLabel}
        aria-pressed={active}
        className="sn-note-card"
        data-active={active}
        data-locked={note.isLocked}
        data-sync-status={note.syncStatus}
        onClick={onSelect}
        title={actionLabel}
        type="button"
      >
        <span className="sn-note-card__topline">
          <strong data-empty-title={isUntitled}>{displayTitle}</strong>
          <time className="sn-note-card__date" dateTime={note.updatedAt}>
            {formatUpdatedAt(note.updatedAt)}
          </time>
          <span className="sn-note-card__signals" aria-label="Note state">
            {shouldShowSyncStatus ? (
              <span
                className="sn-status-dot"
                data-tone={note.syncStatus}
                title={syncStatus}
              />
            ) : null}
            {note.isLocked ? (
              <UiIcon name="lock" />
            ) : null}
          </span>
        </span>
        {shouldShowPreview ? (
          <span className="sn-note-card__preview">{preview}</span>
        ) : null}
        {shouldShowPageStatus || visibleTags.length > 0 ? (
          <span className="sn-note-card__properties">
            {shouldShowPageStatus ? (
              <span
                className="sn-note-card__page-status"
                data-tone={pageStatus.value}
                title={`Status: ${pageStatus.label}`}
              >
                <span aria-hidden="true" className="sn-property-status-icon" data-tone={pageStatus.value}>
                  {pageStatus.icon}
                </span>
                {pageStatus.label}
              </span>
            ) : null}
            {visibleTags.length > 0 ? (
              <span className="sn-note-card__tags" aria-label="Tags">
                {visibleTags.map((tag) => <span key={tag}>{tag}</span>)}
                {hiddenTagCount > 0 ? (
                  <span className="sn-note-card__tag-overflow">+{hiddenTagCount}</span>
                ) : null}
              </span>
            ) : null}
          </span>
        ) : null}
        {shouldShowSyncStatus ? (
          <span className="sn-note-card__meta">{syncStatus}</span>
        ) : null}
      </button>
      {onDelete ? (
        <div className="sn-note-card__actions" ref={actionsRef}>
          <button
            aria-expanded={isActionsOpen}
            aria-haspopup="menu"
            aria-label={`Note actions for ${displayTitle}`}
            className="sn-note-card__actions-trigger"
            onClick={() => setActionsOpen((open) => !open)}
            title="Note actions"
            type="button"
          >
            <span aria-hidden="true" className="sn-note-card__actions-dots">
              <i />
              <i />
              <i />
            </span>
          </button>
          {isActionsOpen ? (
            <div className="sn-note-card__menu" role="menu">
              {onMove ? (
                <button
                  onClick={() => {
                    setActionsOpen(false)
                    onMove(note.id)
                  }}
                  role="menuitem"
                  type="button"
                >
                  <UiIcon name="folder" />
                  Move to folder
                </button>
              ) : null}
              <button
                className="sn-note-card__menu-danger"
                onClick={() => {
                  setActionsOpen(false)
                  onDelete(note.id)
                }}
                role="menuitem"
                type="button"
              >
                <UiIcon name="trash" />
                Move to trash
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
