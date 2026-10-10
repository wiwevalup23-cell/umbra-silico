import type { DragEvent, ReactNode } from 'react'
import type { NoteId, NoteListItem } from '@/shared/contracts/note'
import { NoteCard } from '@/ui/components/notes/NoteCard'
import { UiIcon } from '@/ui/icons/ui/UiIcon'
import { SquircleButton } from '@/ui/components/silicon/SquircleButton'
import { useTranslation } from '@/ui/i18n/use-translation'
import { getPersistencePresentation } from '@/ui/note-presentation'

type NoteListProps = {
  activeNoteId: NoteId | null
  hasRemote?: boolean
  isUnfiled?: boolean
  navigationSlot?: ReactNode
  notes: NoteListItem[]
  onCollapse?: () => void
  onCreateNote: () => void
  onDeleteNote?: (noteId: NoteId) => void
  onDragNoteStart?: (noteId: NoteId, event: DragEvent<HTMLDivElement>) => void
  onOpenLockedNote: (noteId: NoteId) => void
  onOpenTrash?: () => void
  onMoveNote?: (noteId: NoteId) => void
  onSearchChange?: (value: string) => void
  onSelectNote: (noteId: NoteId) => void
  pendingOperations?: number
  searchQuery?: string
  /** Folder name, or null for the whole library. */
  scopeLabel?: string | null
  scopePath?: string
  syncStatus?: string
  trashCount?: number
}

export function NoteList({
  activeNoteId,
  hasRemote = false,
  isUnfiled = false,
  navigationSlot,
  notes,
  onCollapse,
  onCreateNote,
  onDeleteNote,
  onDragNoteStart,
  onOpenLockedNote,
  onOpenTrash,
  onMoveNote,
  onSearchChange,
  onSelectNote,
  pendingOperations = 0,
  searchQuery = '',
  scopeLabel = null,
  scopePath,
  syncStatus = 'synced',
  trashCount = 0,
}: NoteListProps) {
  const { plural, t } = useTranslation()
  const noteCountLabel = plural('library.noteCount', notes.length)
  const searchLabel = scopeLabel
    ? t('library.searchScope', { name: scopeLabel })
    : t('library.searchAll')
  const emptyTitle = isUnfiled ? 'library.emptyUnfiledTitle'
    : scopeLabel ? 'library.emptyFolderTitle' : 'library.emptyTitle'
  const emptyBody = isUnfiled ? 'library.emptyUnfiledBody'
    : scopeLabel ? 'library.emptyFolderBody' : 'library.emptyBody'
  const libraryStatus = getPersistencePresentation({
    hasRemote,
    pendingOperations,
    status: syncStatus,
  })

  return (
    <section className="sn-note-list-shell" aria-label={t('library.notes')}>
      {/* The panel heading is a small window titlebar: the scope's name and an
          engraved ridge. How many notes, and whether they are saved, live in
          the status bar at the foot of the panel. */}
      <header className="sn-panel-heading sn-panel-heading--titlebar">
        <div>
          <div className="sn-panel-heading__title-row">
            {scopePath ? (
              <details className="sn-library-location" key={scopePath}>
                <summary aria-label={`${scopeLabel}. ${t('library.location')}`}>
                  <h2 title={scopePath}>{scopeLabel}</h2>
                  <UiIcon className="sn-icon sn-icon--16" name="chevronDown" />
                </summary>
                <p>{scopePath}</p>
              </details>
            ) : <h2>{scopeLabel ?? t('library.allNotes')}</h2>}
            <span aria-hidden="true" className="sn-panel-heading__ridge" />
          </div>
        </div>
        {onCollapse ? (
          <div className="sn-panel-heading__actions">
            <SquircleButton
              aria-label={t('library.collapse')}
              tooltip={t('library.collapse')}
              className="sn-panel-collapse-button"
              legacyIcon="chevronLeft"
              onClick={onCollapse}
            />
          </div>
        ) : null}
      </header>

      <label className="sn-search-field sn-search">
        <UiIcon className="sn-icon sn-icon--16" name="search" />
        <span className="sr-only">{searchLabel}</span>
        <input
          onChange={(event) => onSearchChange?.(event.target.value)}
          placeholder={searchLabel}
          type="search"
          value={searchQuery}
        />
      </label>

      {navigationSlot}

      {notes.length === 0 ? (
        <div className="sn-empty-list">
          <UiIcon className="sn-icon" name="document" />
          <strong>{t(searchQuery ? 'library.noMatches' : emptyTitle)}</strong>
          <p>{t(searchQuery ? 'library.noMatchesHint' : emptyBody)}</p>
          {!searchQuery ? (
            <button className="sn-empty-list__action" onClick={onCreateNote} type="button">
              {t('switcher.newBlank')}
            </button>
          ) : null}
        </div>
      ) : null}

      <ul className="sn-note-list">
        {notes.map((note, index) => (
          <li key={note.id}>
            <NoteCard
              active={note.id === activeNoteId}
              draggable={Boolean(onDragNoteStart)}
              index={index}
              note={note}
              onDelete={onDeleteNote}
              onDragStart={onDragNoteStart}
              onMove={onMoveNote}
              onSelect={() => {
                if (note.isLocked) {
                  onOpenLockedNote(note.id)
                } else {
                  onSelectNote(note.id)
                }
              }}
            />
          </li>
        ))}
      </ul>

      <footer className="sn-library-footer">
        {onOpenTrash ? (
          <button
            className="sn-library-footer__button"
            onClick={onOpenTrash}
            title={t('trash.title')}
            type="button"
          >
            <span>
              <UiIcon className="sn-icon sn-icon--16" name="trash" />
              <span className="sn-library-footer__label">{t('trash.title')}</span>
            </span>
            {trashCount > 0 ? <span className="sn-library-footer__count">{trashCount}</span> : null}
          </button>
        ) : null}
        <p
          className="sn-panel-status sn-library-footer__status"
          aria-live="polite"
          title={`${noteCountLabel} · ${t(libraryStatus.labelKey)}`}
        >
          <span className="sn-status-dot" data-tone={libraryStatus.tone} />
          <span>{noteCountLabel} · {t(libraryStatus.labelKey)}</span>
        </p>
      </footer>
    </section>
  )
}
