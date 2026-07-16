import type { CSSProperties, DragEvent } from 'react'
import type { NoteId, NoteListItem } from '@/shared/contracts/note'
import { UiIcon } from '@/ui/icons/ui/UiIcon'

type NoteCardProps = {
  active?: boolean
  index?: number
  draggable?: boolean
  note: NoteListItem
  onDelete?: (noteId: NoteId) => void
  onDragStart?: (noteId: NoteId, event: DragEvent<HTMLDivElement>) => void
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
  onSelect,
}: NoteCardProps) {
  const title = note.title.trim()
  const isUntitled = title.length === 0 || title.toLocaleLowerCase() === 'untitled'
  const displayTitle = isUntitled ? 'Untitled' : title
  const actionLabel = note.isLocked ? `Unlock ${displayTitle}` : `Open ${displayTitle}`
  const syncStatus = formatSyncStatus(note.syncStatus)
  const shouldShowSyncStatus = syncStatus.length > 0
  const preview = note.isLocked ? 'Encrypted local note' : note.preview.trim()
  const shouldShowPreview = preview.length > 0

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
        {!note.isLocked && note.tags?.length ? (
          <span className="sn-note-card__tags" aria-label="Tags">
            {note.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}
          </span>
        ) : null}
        {shouldShowSyncStatus ? (
          <span className="sn-note-card__meta">{syncStatus}</span>
        ) : null}
      </button>
      {onDelete ? (
        <button
          aria-label={`Move ${displayTitle} to trash`}
          className="sn-note-card__delete"
          onClick={(event) => {
            event.stopPropagation()
            onDelete(note.id)
          }}
          title="Move to trash"
          type="button"
        >
          <UiIcon name="trash" />
        </button>
      ) : null}
    </div>
  )
}
