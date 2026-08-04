import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import type { NoteId, NoteListItem } from '@/shared/contracts/note'
import type { MessageKey, Translator } from '@/shared/i18n'
import { useTranslation } from '@/ui/i18n/use-translation'
import { UiIcon } from '@/ui/icons/ui/UiIcon'
import { StatusGlyph } from '@/ui/icons/status/StatusGlyph'
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

// 'dirty' is intentionally absent: in the local-first flow it only means
// "not replicated to a remote yet" while the note is already persisted on
// disk, so surfacing it as "Unsaved" would misinform the user.
const exceptionalSyncStatusKeys: Record<string, MessageKey> = {
  conflict: 'state.reviewNeeded',
  error: 'state.reviewNeeded',
  saving: 'state.badgeSaving',
  syncing: 'state.badgeSaving',
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * A card's date reads at the resolution a human would reach for: the exact
 * time while it's still today, "Yesterday" for the day before, a bare day and
 * month within the current year, and only then the full numeric date — never
 * a raw timestamp doing all four jobs at once.
 */
function formatUpdatedAt(
  updatedAt: string,
  formatDateTime: Translator['formatDateTime'],
  yesterdayLabel: string,
  now = new Date(),
): string {
  const date = new Date(updatedAt)

  if (Number.isNaN(date.getTime())) {
    return '--'
  }

  if (isSameCalendarDay(date, now)) {
    return formatDateTime(updatedAt, { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)

  if (isSameCalendarDay(date, yesterday)) {
    return yesterdayLabel
  }

  if (date.getFullYear() === now.getFullYear()) {
    return formatDateTime(updatedAt, { day: '2-digit', month: 'short' })
  }

  return formatDateTime(updatedAt, { day: '2-digit', month: '2-digit', year: '2-digit' })
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
  const { formatDateTime, t } = useTranslation()
  const actionsRef = useRef<HTMLDivElement>(null)
  const [isActionsOpen, setActionsOpen] = useState(false)
  const [isDragging, setDragging] = useState(false)
  const title = note.title.trim()
  const isUntitled = title.length === 0 || title.toLocaleLowerCase() === 'untitled'
  const displayTitle = isUntitled ? t('note.untitled') : title
  const actionLabel = t(note.isLocked ? 'note.unlock' : 'note.open', { title: displayTitle })
  const syncStatusKey = exceptionalSyncStatusKeys[note.syncStatus]
  const syncStatus = syncStatusKey ? t(syncStatusKey) : ''
  const shouldShowSyncStatus = syncStatus.length > 0
  const preview = note.isLocked ? t('note.encryptedPreview') : note.preview.trim()
  const shouldShowPreview = preview.length > 0
  const pageStatus = getPropertyStatusPresentation(note.propertyStatus)
  // A user-created status keeps the wording they typed.
  const pageStatusLabel = pageStatus.labelKey
    ? t(pageStatus.labelKey)
    : pageStatus.label ?? ''
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
      data-dragging={isDragging}
      draggable={draggable}
      onDragEnd={() => setDragging(false)}
      onDragStart={(event) => {
        setDragging(true)
        onDragStart?.(note.id, event)
      }}
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
          {note.kind === 'chat' ? (
            <span aria-label={t('note.chatNote')} className="sn-note-card__kind" title={t('note.chat')}>
              <UiIcon height={13} name="chat" width={13} />
            </span>
          ) : null}
          <strong data-empty-title={isUntitled}>{displayTitle}</strong>
          <time className="sn-note-card__date" dateTime={note.updatedAt}>
            {formatUpdatedAt(note.updatedAt, formatDateTime, t('note.updatedYesterday'))}
          </time>
          <span className="sn-note-card__signals" aria-label={t('note.state')}>
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
                title={t('note.statusTitle', { status: pageStatusLabel })}
              >
                <span aria-hidden="true" className="sn-property-status-icon" data-tone={pageStatus.value}>
                  <StatusGlyph symbol={pageStatus.icon} />
                </span>
                {pageStatusLabel}
              </span>
            ) : null}
            {visibleTags.length > 0 ? (
              <span className="sn-note-card__tags" aria-label={t('note.tags')}>
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
            aria-label={t('note.actionsFor', { title: displayTitle })}
            className="sn-note-card__actions-trigger"
            onClick={() => setActionsOpen((open) => !open)}
            title={t('note.actions')}
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
                  {t('note.moveToFolder')}
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
                {t('note.moveToTrash')}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
