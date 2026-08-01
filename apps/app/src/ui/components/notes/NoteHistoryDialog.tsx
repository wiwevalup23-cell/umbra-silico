import { useRef } from 'react'
import type { NoteVersion } from '@/shared/contracts'
import type { MessageKey, Translator } from '@/shared/i18n'
import { RetroDialogShell } from '@/ui/components/silicon'
import { UiIcon } from '@/ui/icons/ui/UiIcon'
import { useTranslation } from '@/ui/i18n/use-translation'

// Only note-scoped operations ever reach a note's history; anything else falls
// back to a neutral label rather than forcing this map to track every op type.
const changeLabelKeys: Partial<Record<NoteVersion['changeType'], MessageKey>> = {
  'note.create': 'history.created',
  'note.update': 'history.edited',
  'note.delete': 'history.trashed',
  'note.lock': 'history.locked',
  'note.unlock': 'history.unlocked',
}

function formatTimestamp(value: string, translator: Translator): string {
  return Number.isNaN(new Date(value).getTime())
    ? translator.t('history.unknownTime')
    : translator.formatDateTime(value, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
}

export type NoteHistoryDialogProps = {
  error: string | null
  isLoading: boolean
  isRestoring: boolean
  noteTitle: string
  onClose: () => void
  onRestore: (opId: string) => void
  versions: NoteVersion[]
}

export function NoteHistoryDialog({
  error,
  isLoading,
  isRestoring,
  noteTitle,
  onClose,
  onRestore,
  versions,
}: NoteHistoryDialogProps) {
  const translator = useTranslation()
  const { t } = translator
  const closeRef = useRef<HTMLButtonElement>(null)

  return (
    <RetroDialogShell
      className="sn-modal--history"
      describedBy="sn-history-description"
      initialFocusRef={closeRef}
      labelledBy="sn-history-title"
      onClose={onClose}
      title={t('history.title')}
    >
      <div className="sn-history-dialog">
        <div className="sn-history-dialog__intro">
          <h3 id="sn-history-title">
            {t('history.heading', { title: noteTitle || t('note.untitled') })}
          </h3>
          <p id="sn-history-description">
            Recent edits are kept in full, older ones thin out to hourly and then daily
            snapshots. Restoring adds a new version, so nothing is lost.
          </p>
        </div>

        {error ? (
          <p className="sn-history-dialog__error" role="alert">
            {error}
          </p>
        ) : null}

        {isLoading ? (
          <p className="sn-history-dialog__empty" role="status">
            Reading history…
          </p>
        ) : versions.length === 0 ? (
          <p className="sn-history-dialog__empty">No versions retained for this note yet.</p>
        ) : (
          <ol className="sn-history-list" aria-label="Retained versions">
            {versions.map((version) => (
              <li className="sn-history-item" data-current={version.isCurrent} key={version.opId}>
                <div className="sn-history-item__meta">
                  <span className="sn-history-item__when">
                    {formatTimestamp(version.createdAt, translator)}
                  </span>
                  <span className="sn-history-item__kind">
                    {t(changeLabelKeys[version.changeType] ?? 'history.changed')}
                    {version.isCurrent ? ' · current' : ''}
                  </span>
                </div>
                <p className="sn-history-item__preview">
                  {version.isLocked
                    ? t('history.encryptedSnapshot')
                    : version.preview?.trim() || version.title || t('history.emptyNote')}
                </p>
                <button
                  className="sn-history-item__restore"
                  disabled={version.isCurrent || isRestoring}
                  onClick={() => onRestore(version.opId)}
                  type="button"
                >
                  <UiIcon name="refresh" />
                  {t(version.isCurrent ? 'history.current' : 'history.restore')}
                </button>
              </li>
            ))}
          </ol>
        )}

        <div className="sn-history-dialog__actions">
          <button onClick={onClose} ref={closeRef} type="button">
            Close
          </button>
        </div>
      </div>
    </RetroDialogShell>
  )
}
