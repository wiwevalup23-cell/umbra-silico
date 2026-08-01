import { useState } from 'react'
import type { NoteId, NoteListItem } from '@/shared/contracts/note'
import { ConfirmationDialog } from '@/ui/components/silicon'
import { UiIcon } from '@/ui/icons/ui/UiIcon'
import { useTranslation } from '@/ui/i18n/use-translation'

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
  const { t } = useTranslation()
  const [notePendingPurge, setNotePendingPurge] = useState<NoteListItem | null>(null)
  const noteCountLabel = notes.length === 1 ? '1 item' : `${notes.length} items`

  return (
    <>
      <section className="sn-note-list-shell" aria-label={t('trash.title')}>
      <header className="sn-panel-heading">
        <div>
          <div className="sn-panel-heading__title-row">
            <h2>{t('trash.title')}</h2>
            <span className="sn-panel-heading__right">{noteCountLabel}</span>
          </div>
          <p className="sn-panel-status">
            <span className="sn-status-dot" data-tone="dirty" />
            <span>{t('trash.heading')}</span>
          </p>
        </div>
        <div className="sn-panel-heading__actions">
          <button
            aria-label={t('trash.backToLibrary')}
            className="sn-icon-button"
            onClick={onBack}
            title={t('trash.backToLibrary')}
            type="button"
          >
            <UiIcon name="chevronLeft" />
          </button>
          {onCollapse ? (
            <button
              aria-label={t('library.collapse')}
              className="sn-icon-button"
              onClick={onCollapse}
              title={t('library.collapse')}
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
          <strong>{t('trash.empty')}</strong>
          <p>{t('trash.hint')}</p>
        </div>
      ) : null}

      <ul className="sn-trash-list">
        {notes.map((note) => (
          <li className="sn-trash-row" key={note.id}>
            <div className="sn-trash-row__content">
              <strong>{note.title.trim() || 'Untitled'}</strong>
              <p>{note.isLocked ? 'Encrypted local note' : note.preview || 'No preview'}</p>
              <time dateTime={note.updatedAt}>
                {t('trash.deletedAt', { date: formatTrashDate(note.updatedAt) })}
              </time>
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
                onClick={() => setNotePendingPurge(note)}
                type="button"
              >
                {t('trash.deleteForever')}
              </button>
            </div>
          </li>
        ))}
      </ul>
      </section>
      {notePendingPurge ? (
        <ConfirmationDialog
          confirmLabel={t('trash.deleteForever')}
          description={t('trash.purgeDescription', {
            title: notePendingPurge.title.trim() || t('note.untitled'),
          })}
          onCancel={() => setNotePendingPurge(null)}
          onConfirm={() => {
            onPurge(notePendingPurge.id)
            setNotePendingPurge(null)
          }}
          title={t('trash.purgeConfirm')}
        />
      ) : null}
    </>
  )
}
