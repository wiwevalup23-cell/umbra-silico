import type { NoteId, NoteListItem } from '@/shared/contracts/note'
import { UiIcon } from '@/ui/icons/ui/UiIcon'

type TrashViewProps = {
  notes: NoteListItem[]
  onBack: () => void
  onCollapse?: () => void
  onPurge: (noteId: NoteId) => void
  onRestore: (noteId: NoteId) => void
}

const deletedDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

function formatTrashDate(updatedAt: string): string {
  const date = new Date(updatedAt)
  return Number.isNaN(date.getTime()) ? '--' : deletedDateFormatter.format(date)
}

export function TrashView({
  notes,
  onBack,
  onCollapse,
  onPurge,
  onRestore,
}: TrashViewProps) {
  const noteCountLabel = notes.length === 1 ? '1 item' : `${notes.length} items`

  return (
    <section className="sn-note-list-shell" aria-label="Trash">
      <header className="sn-panel-heading">
        <div>
          <div className="sn-panel-heading__title-row">
            <h2>Trash</h2>
            <span className="sn-panel-heading__right">{noteCountLabel}</span>
          </div>
          <p className="sn-panel-status">
            <span className="sn-status-dot" data-tone="dirty" />
            <span>Local deleted notes</span>
          </p>
        </div>
        <div className="sn-panel-heading__actions">
          <button
            aria-label="Back to library"
            className="sn-icon-button"
            onClick={onBack}
            title="Back to library"
            type="button"
          >
            <UiIcon name="chevronLeft" />
          </button>
          {onCollapse ? (
            <button
              aria-label="Collapse notes panel"
              className="sn-icon-button"
              onClick={onCollapse}
              title="Collapse notes panel"
              type="button"
            >
              <UiIcon name="panelLeft" />
            </button>
          ) : null}
        </div>
      </header>

      {notes.length === 0 ? (
        <div className="sn-empty-list">
          <UiIcon name="trash" />
          <strong>Trash is empty</strong>
          <p>Deleted notes will appear here before local purge.</p>
        </div>
      ) : null}

      <ul className="sn-trash-list">
        {notes.map((note) => (
          <li className="sn-trash-row" key={note.id}>
            <div className="sn-trash-row__content">
              <strong>{note.title.trim() || 'Untitled'}</strong>
              <p>{note.isLocked ? 'Encrypted local note' : note.preview || 'No preview'}</p>
              <time dateTime={note.updatedAt}>Deleted {formatTrashDate(note.updatedAt)}</time>
            </div>
            <div className="sn-trash-row__actions">
              <button
                className="sn-mini-button"
                onClick={() => onRestore(note.id)}
                type="button"
              >
                Restore
              </button>
              <button
                className="sn-mini-button sn-mini-button--danger"
                onClick={() => {
                  if (window.confirm('Delete this note forever from local storage?')) {
                    onPurge(note.id)
                  }
                }}
                type="button"
              >
                Delete forever
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
