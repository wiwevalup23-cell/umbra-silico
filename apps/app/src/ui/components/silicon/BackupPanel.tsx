import { useRef, useState } from 'react'
import { useTranslation } from '@/ui/i18n/use-translation'
import { UiIcon } from '@/ui/icons/ui/UiIcon'

export type BackupPanelProps = {
  busyTask: 'backup' | 'markdown' | 'restore' | null
  error: string | null
  onExportBackup: (options: { includeImages: boolean }) => void
  onExportMarkdown: () => void
  onRestoreFile: (file: File) => void
  status: string | null
}

export function BackupPanel({
  busyTask,
  error,
  onExportBackup,
  onExportMarkdown,
  onRestoreFile,
  status,
}: BackupPanelProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [includeImages, setIncludeImages] = useState(true)
  const isBusy = busyTask !== null

  return (
    <section className="sn-settings-section sn-backup-panel">
      <div className="sn-settings-section__label">{t('data.title')}</div>
      <p className="sn-settings-section__hint">{t('data.hint')}</p>

      <div className="sn-backup-panel__row">
        <button
          disabled={isBusy}
          onClick={() => onExportBackup({ includeImages })}
          type="button"
        >
          <UiIcon name="document" />
          {busyTask === 'backup' ? t('data.saving') : t('data.saveBackup')}
        </button>
        <button disabled={isBusy} onClick={onExportMarkdown} type="button">
          <UiIcon name="template" />
          {busyTask === 'markdown' ? t('data.exporting') : t('data.exportMarkdown')}
        </button>
      </div>

      <label className="sn-backup-panel__toggle">
        <input
          checked={includeImages}
          disabled={isBusy}
          onChange={(event) => setIncludeImages(event.target.checked)}
          type="checkbox"
        />
        <span>{t('data.includePhotos')}</span>
      </label>

      <p className="sn-settings-section__hint">{t('data.backupHint')}</p>

      <div className="sn-backup-panel__row">
        <button disabled={isBusy} onClick={() => fileInputRef.current?.click()} type="button">
          <UiIcon name="refresh" />
          {busyTask === 'restore' ? t('data.restoring') : t('data.restore')}
        </button>
        <input
          accept="application/json,.json"
          className="sn-sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onRestoreFile(file)
            // Clear so picking the same file twice fires again.
            event.target.value = ''
          }}
          ref={fileInputRef}
          type="file"
        />
      </div>
      <p className="sn-settings-section__hint">{t('data.restoreHint')}</p>

      {status ? (
        <p className="sn-backup-panel__status" role="status">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="sn-backup-panel__error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
