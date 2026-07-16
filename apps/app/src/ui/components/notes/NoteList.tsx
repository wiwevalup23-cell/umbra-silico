import type { DragEvent, ReactNode } from 'react'
import type { NoteId, NoteListItem } from '@/shared/contracts/note'
import { NoteCard } from '@/ui/components/notes/NoteCard'
import { UiIcon } from '@/ui/icons/ui/UiIcon'

type NoteListProps = {
  activeNoteId: NoteId | null
  navigationSlot?: ReactNode
  notes: NoteListItem[]
  onCollapse?: () => void
  onCreateNote: () => void
  onDeleteNote?: (noteId: NoteId) => void
  onDragNoteStart?: (noteId: NoteId, event: DragEvent<HTMLDivElement>) => void
  onOpenLockedNote: (noteId: NoteId) => void
  onOpenTrash?: () => void
  onSearchChange?: (value: string) => void
  onSelectNote: (noteId: NoteId) => void
  pendingOperations?: number
  searchQuery?: string
  syncStatus?: string
  trashCount?: number
}

const syncStatusLabels: Record<string, string> = {
  conflict: 'Review needed',
  dirty: 'Saved locally',
  error: 'Review needed',
  idle: 'Saved locally',
  saving: 'Saving',
  synced: 'Saved locally',
  syncing: 'Syncing',
}

function formatLibraryStatus(syncStatus: string, pendingOperations: number): string {
  if (pendingOperations > 0 && syncStatus !== 'conflict' && syncStatus !== 'error') {
    return `${pendingOperations} pending`
  }

  return syncStatusLabels[syncStatus] ?? 'Local notebook'
}

export function NoteList({
  activeNoteId,
  navigationSlot,
  notes,
  onCollapse,
  onCreateNote,
  onDeleteNote,
  onDragNoteStart,
  onOpenLockedNote,
  onOpenTrash,
  onSearchChange,
  onSelectNote,
  pendingOperations = 0,
  searchQuery = '',
  syncStatus = 'synced',
  trashCount = 0,
}: NoteListProps) {
  const noteCountLabel = notes.length === 1 ? '1 note' : `${notes.length} notes`
  const libraryStatus = formatLibraryStatus(syncStatus, pendingOperations)

  return (
    <section className="sn-note-list-shell" aria-label="Notes">
      <header className="sn-panel-heading">
        <div>
          <div className="sn-panel-heading__title-row">
            <h2>Library</h2>
            <span className="sn-panel-heading__right">{noteCountLabel}</span>
          </div>
          <p className="sn-panel-status" aria-live="polite">
            <span className="sn-status-dot" data-tone={syncStatus} />
            <span>{libraryStatus}</span>
          </p>
        </div>
        <div className="sn-panel-heading__actions">
          {onCollapse ? (
            <button
              aria-label="Collapse notes panel"
              className="sn-icon-button"
              onClick={onCollapse}
              title="Collapse notes panel"
              type="button"
            >
              <UiIcon name="chevronLeft" />
            </button>
          ) : null}
          <button
            aria-label="Create note"
            className="sn-icon-button sn-icon-button--primary"
            onClick={onCreateNote}
            title="Create note"
            type="button"
          >
            <UiIcon name="plus" />
          </button>
        </div>
      </header>

      <label className="sn-search-field">
        <UiIcon name="search" />
        <span className="sr-only">Search notes</span>
        <input
          onChange={(event) => onSearchChange?.(event.target.value)}
          placeholder="Search notes"
          type="search"
          value={searchQuery}
        />
      </label>

      {navigationSlot}

      {notes.length === 0 ? (
        <div className="sn-empty-list">
          <UiIcon name="document" />
          <strong>{searchQuery ? 'No matching notes' : 'No notes yet'}</strong>
          <p>{searchQuery ? 'Try a different search.' : 'Start with a blank local note.'}</p>
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

      {onOpenTrash ? (
        <footer className="sn-library-footer">
          <button
            className="sn-library-footer__button"
            onClick={onOpenTrash}
            type="button"
          >
            <span>
              <UiIcon name="trash" />
              Trash
            </span>
            <span>{trashCount}</span>
          </button>
        </footer>
      ) : null}
    </section>
  )
}
