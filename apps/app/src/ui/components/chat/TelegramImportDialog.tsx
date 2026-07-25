import { useRef, useState } from 'react'
import type {
  NoteId,
  TelegramExportFolder,
  TelegramImportProgress,
  TelegramImportResult,
} from '@/shared/contracts'
import { RetroDialogShell } from '@/ui/components/silicon'
import { UiIcon } from '@/ui/icons/ui/UiIcon'

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

function progressLabel(progress: TelegramImportProgress | null): string {
  if (!progress) {
    return 'Preparing import…'
  }

  switch (progress.phase) {
    case 'creating':
      return 'Creating a safe local chat copy…'
    case 'attachments':
      return `Importing attachments ${progress.completedAttachments}/${progress.totalAttachments}…`
    case 'saving':
      return 'Saving the imported conversation…'
  }
}

export function TelegramImportDialog({
  destinationLabel,
  onClose,
  onImport,
  onOpenNote,
  onReadFolder,
}: TelegramImportDialogProps) {
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
          : 'The selected folder could not be read.',
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
          : 'Telegram chat import failed.',
      )
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <RetroDialogShell
      className="sn-modal--command sn-modal--telegram-import"
      closeDisabled={isImporting}
      initialFocusRef={chooseButtonRef}
      labelledBy="telegram-import-title"
      onClose={onClose}
      showTitlebar={false}
      title="Import Telegram chat"
    >
      <section className="sn-command-window sn-telegram-import">
        <header className="sn-command-window__header">
          <div>
            <span className="sn-command-window__eyebrow">Telegram Desktop</span>
            <h2 id="telegram-import-title">Import a chat folder</h2>
          </div>
          <button
            aria-label="Close Telegram import"
            className="sn-icon-button"
            disabled={isImporting}
            onClick={onClose}
            type="button"
          >
            <UiIcon name="close" />
          </button>
        </header>

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
              <UiIcon height={26} name="check" width={26} />
            </span>
            <div>
              <strong>Telegram chat imported</strong>
              <p>
                {result.importedMessageCount} messages and{' '}
                {result.importedAttachmentCount} attachments were saved.
              </p>
              {result.skippedAttachmentCount > 0 ? (
                <p>
                  {result.skippedAttachmentCount} attachments could not be imported;
                  readable placeholders were kept in the chat.
                </p>
              ) : null}
              {result.warnings.length > 0 ? (
                <details className="sn-telegram-import__warnings">
                  <summary>
                    {result.warnings.length} import notice
                    {result.warnings.length === 1 ? '' : 's'}
                  </summary>
                  <ul>
                    {result.warnings.slice(0, 12).map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
            <button
              className="sn-button sn-button--primary"
              onClick={() => onOpenNote(result.noteId)}
              type="button"
            >
              Open imported chat
            </button>
          </div>
        ) : (
          <>
            <div className="sn-telegram-import__instructions">
              <UiIcon height={22} name="folder" width={22} />
              <div>
                <strong>Select the exported chat folder</strong>
                <p>
                  In Telegram Desktop choose export format <b>HTML</b> and include
                  photos/media. Umbra reads the copy you select; it never modifies
                  the source folder.
                </p>
              </div>
              <button
                className="sn-button sn-button--primary"
                disabled={isReading || isImporting}
                onClick={() => fileInputRef.current?.click()}
                ref={chooseButtonRef}
                type="button"
              >
                <UiIcon height={16} name="folder" width={16} />
                {exportFolder ? 'Choose another folder' : 'Choose folder'}
              </button>
            </div>

            {isReading ? (
              <div aria-live="polite" className="sn-telegram-import__status" role="status">
                Reading Telegram export…
              </div>
            ) : null}

            {exportFolder ? (
              <div className="sn-telegram-import__preview">
                <div className="sn-telegram-import__summary">
                  <span>Chat</span>
                  <strong>{exportFolder.title}</strong>
                  <span>Messages</span>
                  <strong>{exportFolder.messages.length}</strong>
                  <span>Attachments</span>
                  <strong>
                    {exportFolder.availableAttachmentCount}/
                    {exportFolder.attachmentCount} available
                  </strong>
                  <span>Destination</span>
                  <strong>{destinationLabel}</strong>
                </div>

                <label className="sn-telegram-import__participant">
                  <span>Which participant is you?</span>
                  <select
                    onChange={(event) => setSelfParticipant(event.target.value)}
                    value={selfParticipant}
                  >
                    <option disabled value="">
                      Select your Telegram identity…
                    </option>
                    {exportFolder.participants.map((participant) => (
                      <option key={participant.name} value={participant.name}>
                        {participant.name} · {participant.messageCount} messages
                      </option>
                    ))}
                  </select>
                  <small>
                    Messages from this participant appear on the right. Everyone
                    else appears on the left.
                  </small>
                </label>

                {exportFolder.warnings.length > 0 ? (
                  <details className="sn-telegram-import__warnings">
                    <summary>
                      {exportFolder.warnings.length} import notice
                      {exportFolder.warnings.length === 1 ? '' : 's'}
                    </summary>
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
                <UiIcon height={16} name="info" width={16} />
                <span>{error}</span>
              </div>
            ) : null}

            {isImporting ? (
              <div aria-live="polite" className="sn-telegram-import__status" role="status">
                {progressLabel(progress)}
              </div>
            ) : null}

            <footer className="sn-telegram-import__actions">
              <button
                className="sn-button"
                disabled={isImporting}
                onClick={onClose}
                type="button"
              >
                Cancel
              </button>
              <button
                className="sn-button sn-button--primary"
                disabled={!exportFolder || !selfParticipant || isImporting}
                onClick={() => void startImport()}
                type="button"
              >
                <UiIcon height={16} name="arrowDown" width={16} />
                Import as a new chat
              </button>
            </footer>
          </>
        )}
      </section>
    </RetroDialogShell>
  )
}
