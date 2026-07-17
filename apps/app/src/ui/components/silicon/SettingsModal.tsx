import { useEffect, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import {
  backgroundImageOptions,
  backgroundPatternOptions,
  type BackgroundPattern,
} from '@/shared/backgrounds'
import { UiIcon } from '@/ui/icons/ui/UiIcon'

type SettingsValue = {
  backgroundImage: string | null
  backgroundPattern: BackgroundPattern
  backgroundOpacity: number
  inspectorWidth: number
  sidebarWidth: number
}

const PATTERN_PREVIEWS: Record<BackgroundPattern, CSSProperties> = {
  grid: {
    '--sn-background-preview':
      'linear-gradient(rgba(28, 27, 24, 0.32) 1px, transparent 1px), linear-gradient(90deg, rgba(28, 27, 24, 0.22) 1px, transparent 1px)',
    '--sn-background-preview-size': '10px 10px, 10px 10px',
  } as CSSProperties,
  scanlines: {
    '--sn-background-preview': 'linear-gradient(rgba(28, 27, 24, 0.4) 1px, transparent 1px)',
    '--sn-background-preview-size': '100% 3px',
  } as CSSProperties,
  none: {
    '--sn-background-preview': 'none',
    '--sn-background-preview-size': 'auto',
  } as CSSProperties,
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
  const currentPattern = settings.backgroundPattern
  const currentOpacity = settings.backgroundOpacity

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
          <div className="sn-settings-section__label" id="sn-background-pattern-label">
            Background pattern
            <strong>
              {backgroundPatternOptions.find((option) => option.value === currentPattern)?.label ??
                'Grid · graph paper'}
            </strong>
          </div>
          <p className="sn-settings-section__hint">
            The texture drawn behind the workspace panel.
          </p>
          <div
            aria-labelledby="sn-background-pattern-label"
            className="sn-background-picker sn-background-picker--pattern"
            role="radiogroup"
          >
            {backgroundPatternOptions.map((option) => (
              <button
                aria-checked={currentPattern === option.value}
                className="sn-pattern-option"
                key={option.value}
                onClick={() => updateSetting('backgroundPattern', option.value)}
                role="radio"
                style={PATTERN_PREVIEWS[option.value]}
                type="button"
              >
                <span aria-hidden="true" className="sn-pattern-option__swatch" />
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="sn-settings-section">
          <div className="sn-settings-section__label" id="sn-background-opacity-label">
            Background opacity
            <strong>{currentOpacity}%</strong>
          </div>
          <p className="sn-settings-section__hint">
            Fades the pattern and image behind the player and the editor paper.
          </p>
          <input
            aria-labelledby="sn-background-opacity-label"
            className="sn-opacity-range"
            max={100}
            min={0}
            onChange={(event) => updateSetting('backgroundOpacity', Number(event.target.value))}
            type="range"
            value={currentOpacity}
          />
        </section>

        <section className="sn-settings-section">
          <div className="sn-settings-section__label" id="sn-background-picker-label">
            Workspace background
            <strong>{backgroundImageOptions.find((option) => option.value === settings.backgroundImage)?.label ?? 'None · clean grid'}</strong>
          </div>
          <p className="sn-settings-section__hint">
            Used behind the player and the editor paper.
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
