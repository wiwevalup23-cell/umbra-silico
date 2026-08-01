import { useRef } from 'react'
import type { NoteTemplateId, NoteTemplateSummary } from '@/shared/note-templates'
import { RetroDialogShell } from '@/ui/components/silicon'
import { UiIcon } from '@/ui/icons/ui/UiIcon'
import { useTranslation } from '@/ui/i18n/use-translation'

const templateIcons = {
  blank: 'document',
  chat: 'chat',
  daily: 'calendar',
  meeting: 'users',
  project: 'briefcase',
} as const

type TemplatePickerProps = {
  onClose: () => void
  onImportTelegram?: (() => void) | null
  onSelect: (templateId: NoteTemplateId) => void
  templates: NoteTemplateSummary[]
}

export function TemplatePicker({
  onClose,
  onImportTelegram = null,
  onSelect,
  templates,
}: TemplatePickerProps) {
  const { t } = useTranslation()
  const firstTemplateRef = useRef<HTMLButtonElement>(null)

  return (
    <RetroDialogShell
      className="sn-modal--command"
      initialFocusRef={firstTemplateRef}
      labelledBy="template-picker-title"
      onClose={onClose}
      showTitlebar={false}
      title={t('templates.title')}
    >
      <section className="sn-command-window sn-template-picker">
        <header className="sn-command-window__header">
          <div>
            <span className="sn-command-window__eyebrow">New page</span>
            <h2 id="template-picker-title">{t('templates.title')}</h2>
          </div>
          <button
            aria-label={t('templates.close')}
            className="sn-icon-button"
            onClick={onClose}
            type="button"
          >
            <UiIcon name="close" />
          </button>
        </header>

        <div className="sn-template-grid">
          {templates.map((template, index) => (
            <button
              className="sn-template-card"
              data-template={template.id}
              key={template.id}
              onClick={() => onSelect(template.id)}
              ref={index === 0 ? firstTemplateRef : undefined}
              type="button"
            >
              <span className="sn-template-card__icon" aria-hidden="true">
                <UiIcon name={templateIcons[template.id]} />
              </span>
              <span>
                <strong>{t(template.labelKey)}</strong>
                <small>{t(template.descriptionKey)}</small>
              </span>
              <UiIcon name="chevronRight" />
            </button>
          ))}
          {onImportTelegram ? (
            <button
              className="sn-template-card sn-template-card--telegram"
              data-template="telegram-import"
              onClick={onImportTelegram}
              type="button"
            >
              <span className="sn-template-card__icon" aria-hidden="true">
                <UiIcon name="arrowDown" />
              </span>
              <span>
                <strong>{t('templates.importTelegram')}</strong>
                <small>{t('templates.importTelegramHint')}</small>
              </span>
              <UiIcon name="chevronRight" />
            </button>
          ) : null}
        </div>
      </section>
    </RetroDialogShell>
  )
}
