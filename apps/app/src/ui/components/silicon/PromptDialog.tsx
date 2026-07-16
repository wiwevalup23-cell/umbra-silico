import { useRef, useState } from 'react'
import { UiIcon } from '@/ui/icons/ui/UiIcon'
import { RetroDialogShell } from './RetroDialogShell'

type PromptDialogProps = {
  description: string
  initialValue?: string
  label: string
  onCancel: () => void
  onSubmit: (value: string) => void
  submitLabel: string
  title: string
}

export function PromptDialog({
  description,
  initialValue = '',
  label,
  onCancel,
  onSubmit,
  submitLabel,
  title,
}: PromptDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(initialValue)
  const normalizedValue = value.trim()

  return (
    <RetroDialogShell
      className="sn-modal--prompt"
      describedBy="sn-prompt-dialog-description"
      initialFocusRef={inputRef}
      labelledBy="sn-prompt-dialog-title"
      onClose={onCancel}
      title="Folder"
    >
      <form
        className="sn-prompt-dialog"
        onSubmit={(event) => {
          event.preventDefault()
          if (normalizedValue) onSubmit(normalizedValue)
        }}
      >
        <div className="sn-prompt-dialog__intro">
          <span className="sn-modal-icon" aria-hidden="true">
            <UiIcon name="folder" />
          </span>
          <div>
            <h3 id="sn-prompt-dialog-title">{title}</h3>
            <p id="sn-prompt-dialog-description">{description}</p>
          </div>
        </div>
        <label className="sn-prompt-dialog__field">
          <span>{label}</span>
          <input
            maxLength={80}
            onChange={(event) => setValue(event.target.value)}
            ref={inputRef}
            value={value}
          />
        </label>
        <div className="sn-modal-actions">
          <button onClick={onCancel} type="button">Cancel</button>
          <button disabled={!normalizedValue} type="submit">{submitLabel}</button>
        </div>
      </form>
    </RetroDialogShell>
  )
}
