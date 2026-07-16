import { useEffect, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { backgroundImageOptions } from '@/shared/backgrounds'
import { UiIcon } from '@/ui/icons/ui/UiIcon'

type SettingsValue = {
  backgroundImage: string | null
  inspectorWidth: number
  sidebarWidth: number
}

type SettingsModalProps = {
  onClose: () => void
  settings: SettingsValue
  updateSetting: <K extends keyof SettingsValue>(
    key: K,
    value: SettingsValue[K],
  ) => void
}

export function SettingsModal({ onClose, settings, updateSetting }: SettingsModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current

    if (!dialog) {
      return
    }

    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) {
        dialog.showModal()
      }
    } else {
      dialog.setAttribute('open', '')
    }

    return () => {
      if (dialog.open) {
        if (typeof dialog.close === 'function') {
          dialog.close()
        } else {
          dialog.removeAttribute('open')
        }
      }
    }
  }, [])

  const modalContent = (
    <dialog
      aria-labelledby="sn-settings-modal-title"
      aria-modal="true"
      className="sn-modal sn-settings-modal"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
      ref={dialogRef}
    >
      <div className="sn-modal__surface sn-settings-modal__surface">
        <header className="sn-settings-modal__header">
          <h2 id="sn-settings-modal-title">
            <UiIcon name="settings" />
            Settings
          </h2>
          <button
            aria-label="Close settings"
            className="sn-icon-button"
            onClick={onClose}
            title="Close"
            type="button"
          >
            <UiIcon name="close" />
          </button>
        </header>

        <section className="sn-settings-section">
          <div className="sn-settings-section__label" id="sn-background-picker-label">
            Empty screen background
            <strong>{backgroundImageOptions.find((option) => option.value === settings.backgroundImage)?.label ?? 'None · clean grid'}</strong>
          </div>
          <p className="sn-settings-section__hint">
            Used behind the player before a note is selected.
          </p>
          <div
            aria-labelledby="sn-background-picker-label"
            className="sn-background-picker"
            role="radiogroup"
          >
            {backgroundImageOptions.map((option) => (
              <button
                aria-checked={settings.backgroundImage === option.value}
                className="sn-background-option"
                key={option.label}
                onClick={() => updateSetting('backgroundImage', option.value)}
                role="radio"
                style={option.value ? { '--sn-background-preview': `url("${option.value}")` } as CSSProperties : undefined}
                type="button"
              >
                <span className="sn-background-option__swatch" aria-hidden="true" />
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </dialog>
  )

  return createPortal(modalContent, document.body)
}
