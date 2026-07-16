import type { NoteTemplateId, NoteTemplateSummary } from '@/shared/note-templates'
import { UiIcon } from '@/ui/icons/ui/UiIcon'

type TemplatePickerProps = {
  onClose: () => void
  onSelect: (templateId: NoteTemplateId) => void
  templates: NoteTemplateSummary[]
}

export function TemplatePicker({ onClose, onSelect, templates }: TemplatePickerProps) {
  return (
    <div
      aria-labelledby="template-picker-title"
      aria-modal="true"
      className="sn-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="dialog"
    >
      <section className="sn-command-window sn-template-picker">
        <header className="sn-command-window__header">
          <div>
            <span className="sn-command-window__eyebrow">New page</span>
            <h2 id="template-picker-title">Choose a starting point</h2>
          </div>
          <button aria-label="Close templates" className="sn-icon-button" onClick={onClose} type="button">
            <UiIcon name="close" />
          </button>
        </header>

        <div className="sn-template-grid">
          {templates.map((template) => (
            <button
              className="sn-template-card"
              key={template.id}
              onClick={() => onSelect(template.id)}
              type="button"
            >
              <span className="sn-template-card__icon" aria-hidden="true">
                <UiIcon name={template.id === 'blank' ? 'document' : 'template'} />
              </span>
              <span>
                <strong>{template.label}</strong>
                <small>{template.description}</small>
              </span>
              <UiIcon name="chevronRight" />
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
