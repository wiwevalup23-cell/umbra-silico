import { useRef, useState } from 'react'
import type {
  NoteId,
  TelegramExportFolder,
  TelegramImportProgress,
  TelegramImportResult,
} from '@/shared/contracts'
import { RetroDialogShell } from '@/ui/components/silicon'
import { UiIcon } from '@/ui/icons/ui/UiIcon'
import type { Translator } from '@/shared/i18n'
import { useTranslation } from '@/ui/i18n/use-translation'

/** Just the lookup half of the translator, for module-level helpers. */
type Translate = Translator['t']

type TelegramImportDialogProps = {
  destinationLabel: string
  onClose: () => void
  onImport: (
    exportFolder: TelegramExportFolder,
    selfParticipant: string,
    onProgress: (progress: TelegramImportProgress) => void,
  ) => Promise<TelegramImportResult>
  onOpenNote: (noteId: NoteId) => void
  onReadFolder: (files: File[]) => Promise<TelegramExportFolder>
}

function progressLabel(progress: TelegramImportProgress | null, t: Translate): string {
  if (!progress) {
    return t('telegram.preparing')
  }

  switch (progress.phase) {
    case 'creating':
      return t('telegram.creating')
    case 'attachments':
      return `Importing attachments ${progress.completedAttachments}/${progress.totalAttachments}…`
    case 'saving':
      return t('telegram.saving')
  }
}

export function TelegramImportDialog({
  destinationLabel,
  onClose,
  onImport,
  onOpenNote,
  onReadFolder,
}: TelegramImportDialogProps) {
  const { plural, t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const chooseButtonRef = useRef<HTMLButtonElement>(null)
  const [exportFolder, setExportFolder] = useState<TelegramExportFolder | null>(null)
  const [selfParticipant, setSelfParticipant] = useState('')
  const [isReading, setIsReading] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [progress, setProgress] = useState<TelegramImportProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<TelegramImportResult | null>(null)

  async function readFolder(files: File[]) {
    setError(null)
    setExportFolder(null)
    setResult(null)
    setIsReading(true)

    try {
      const parsed = await onReadFolder(files)
      setExportFolder(parsed)
      setSelfParticipant(parsed.suggestedSelfParticipant ?? '')
    } catch (readError) {
      setError(
        readError instanceof Error
          ? readError.message
          : t('telegram.readFailed'),
      )
    } finally {
      setIsReading(false)
    }
  }

  async function startImport() {
    if (!exportFolder || !selfParticipant || isImporting) {
      return
    }

    setError(null)
    setProgress(null)
    setIsImporting(true)

    try {
      setResult(await onImport(exportFolder, selfParticipant, setProgress))
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : t('telegram.importFailed'),
      )
    } finally {
      setIsImporting(false)
    }
  }

  return (
    // The common window: titlebar with the dialog's name and a 36 squircle,
    // then the task heading — not a header of its own with a mono eyebrow.
    <RetroDialogShell
      className="sn-modal--telegram-import"
      closeDisabled={isImporting}
      closeLabel={t('telegram.close')}
      initialFocusRef={chooseButtonRef}
      labelledBy="telegram-import-title"
      onClose={onClose}
      title={t('telegram.title')}
    >
      <section className="sn-telegram-import">
        <h3 className="sn-telegram-import__heading">{t('telegram.heading')}</h3>

        <input
          hidden
          multiple
          onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            event.target.value = ''
            void readFolder(files)
          }}
          ref={(input) => {
            fileInputRef.current = input

            if (input) {
              input.setAttribute('webkitdirectory', '')
              input.setAttribute('directory', '')
            }
          }}
          type="file"
        />

        {result ? (
          <div className="sn-telegram-import__result">
            <span aria-hidden="true" className="sn-telegram-import__result-icon">
              <UiIcon className="sn-icon" name="check" />
            </span>
            <div>
              <strong>{t('telegram.imported')}</strong>
              <p>
                {t('telegram.importedSummary', {
                  attachments: result.importedAttachmentCount,
                  messages: result.importedMessageCount,
                })}
              </p>
              {result.skippedAttachmentCount > 0 ? (
                <p>{t('telegram.skippedAttachments', { count: result.skippedAttachmentCount })}</p>
              ) : null}
              {result.warnings.length > 0 ? (
                <details className="sn-telegram-import__warnings">
                  <summary>{plural('telegram.noticeCount', result.warnings.length)}</summary>
                  <ul>
                    {result.warnings.slice(0, 12).map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
            <button
              className="sn-btn sn-btn--36 sn-btn--primary"
              onClick={() => onOpenNote(result.noteId)}
              type="button"
            >
              {t('telegram.openImported')}
            </button>
          </div>
        ) : (
          <>
            <div className="sn-telegram-import__instructions">
              <UiIcon className="sn-icon" name="folder" />
              <div>
                <strong>{t('telegram.selectFolder')}</strong>
                <p>
                  {t('telegram.instructionsBefore')} <b>HTML</b>{' '}
                  {t('telegram.instructionsAfter')}
                </p>
              </div>
              <button
                className="sn-btn sn-btn--36 sn-btn--primary"
                disabled={isReading || isImporting}
                onClick={() => fileInputRef.current?.click()}
                ref={chooseButtonRef}
                type="button"
              >
                <UiIcon className="sn-icon sn-icon--16" name="folder" />
                {t(exportFolder ? 'telegram.chooseAnotherFolder' : 'telegram.chooseFolder')}
              </button>
            </div>

            {isReading ? (
              <div aria-live="polite" className="sn-telegram-import__status" role="status">
                {t('telegram.reading')}
              </div>
            ) : null}

            {exportFolder ? (
              <div className="sn-telegram-import__preview">
                <div className="sn-telegram-import__summary">
                  <span>{t('telegram.chat')}</span>
                  <strong>{exportFolder.title}</strong>
                  <span>{t('telegram.messages')}</span>
                  <strong>{exportFolder.messages.length}</strong>
                  <span>{t('telegram.attachments')}</span>
                  <strong>
                    {t('telegram.attachmentsAvailable', {
                      available: exportFolder.availableAttachmentCount,
                      total: exportFolder.attachmentCount,
                    })}
                  </strong>
                  <span>{t('telegram.destination')}</span>
                  <strong>{destinationLabel}</strong>
                </div>

                <label className="sn-telegram-import__participant">
                  <span>{t('telegram.whichParticipant')}</span>
                  <select
                    onChange={(event) => setSelfParticipant(event.target.value)}
                    value={selfParticipant}
                  >
                    <option disabled value="">
                      {t('telegram.selectIdentity')}
                    </option>
                    {exportFolder.participants.map((participant) => (
                      <option key={participant.name} value={participant.name}>
                        {plural('telegram.participantMessages', participant.messageCount, {
                          name: participant.name,
                        })}
                      </option>
                    ))}
                  </select>
                  <small>{t('telegram.sidesHint')}</small>
                </label>

                {exportFolder.warnings.length > 0 ? (
                  <details className="sn-telegram-import__warnings">
                    <summary>{plural('telegram.noticeCount', exportFolder.warnings.length)}</summary>
                    <ul>
                      {exportFolder.warnings.slice(0, 12).map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <div className="sn-telegram-import__error" role="alert">
                <UiIcon className="sn-icon sn-icon--16" name="info" />
                <span>{error}</span>
              </div>
            ) : null}

            {isImporting ? (
              <div aria-live="polite" className="sn-telegram-import__status" role="status">
                {progressLabel(progress, t)}
              </div>
            ) : null}

            <footer className="sn-telegram-import__actions">
              <button
                className="sn-btn sn-btn--36"
                disabled={isImporting}
                onClick={onClose}
                type="button"
              >
                {t('action.cancel')}
              </button>
              <button
                className="sn-btn sn-btn--36 sn-btn--primary"
                disabled={!exportFolder || !selfParticipant || isImporting}
                onClick={() => void startImport()}
                type="button"
              >
                <UiIcon className="sn-icon sn-icon--16" name="arrowDown" />
                {t('telegram.importSubmit')}
              </button>
            </footer>
          </>
        )}
      </section>
    </RetroDialogShell>
  )
}
