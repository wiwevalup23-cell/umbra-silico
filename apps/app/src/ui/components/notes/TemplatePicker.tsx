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
    // The same window as every other dialog (titlebar, title, 36 squircle to
    // close). The old header had its own grid, a serif heading and an English
    // "NEW PAGE" eyebrow on a Russian screen.
    <RetroDialogShell
      className="sn-modal--templates"
      closeLabel={t('templates.close')}
      initialFocusRef={firstTemplateRef}
      labelledBy="template-picker-title"
      onClose={onClose}
      title={t('templates.title')}
    >
      <section className="sn-template-picker">
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
                <UiIcon className="sn-icon" name={templateIcons[template.id]} />
              </span>
              <span>
                <strong>{t(template.labelKey)}</strong>
                <small>{t(template.descriptionKey)}</small>
              </span>
              <UiIcon className="sn-icon sn-icon--16" name="chevronRight" />
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
                <UiIcon className="sn-icon" name="arrowDown" />
              </span>
              <span>
                <strong>{t('templates.importTelegram')}</strong>
                <small>{t('templates.importTelegramHint')}</small>
              </span>
              <UiIcon className="sn-icon sn-icon--16" name="chevronRight" />
            </button>
          ) : null}
        </div>
      </section>
    </RetroDialogShell>
  )
}
