import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  backgroundImageOptions,
  backgroundPatternOptions,
  customBackgroundMaxBytes,
  customBackgroundValue,
  supportedBackgroundMimeTypes,
  type BackgroundPattern,
  type CustomBackgroundErrorCode,
} from '@/shared/backgrounds'
import { localeLabels, locales, type Locale } from '@/shared/i18n'
import { useTranslation } from '@/ui/i18n/use-translation'
import { UiIcon } from '@/ui/icons/ui/UiIcon'

type SettingsValue = {
  locale: Locale
  backgroundImage: string | null
  backgroundPattern: BackgroundPattern
  backgroundOpacity: number
  inspectorWidth: number
  sidebarWidth: number
}

/** The user's own background image, owned and persisted a layer up. */
export type CustomBackgroundView = {
  error: CustomBackgroundErrorCode | null
  isBusy: boolean
  url: string | null
  onDismissError: () => void
  onRemove: () => void
  onUpload: (file: File) => void
}

type SettingsTab = 'appearance' | 'language' | 'data'

const PATTERN_PREVIEWS: Record<BackgroundPattern, CSSProperties> = {
  grid: {
    '--sn-background-preview':
      'linear-gradient(rgba(28, 27, 24, 0.32) 1px, transparent 1px), linear-gradient(90deg, rgba(28, 27, 24, 0.22) 1px, transparent 1px)',
    '--sn-background-preview-size': '8px 8px, 8px 8px',
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

const PATTERN_LABEL_KEYS = {
  grid: 'settings.patternGrid',
  scanlines: 'settings.patternScanlines',
  none: 'settings.patternNone',
} as const

const BACKGROUND_ERROR_KEYS = {
  unsupported: 'settings.backgroundErrorUnsupported',
  tooLarge: 'settings.backgroundErrorTooLarge',
  failed: 'settings.backgroundErrorFailed',
} as const

type SettingsModalProps = {
  customBackground: CustomBackgroundView
  /** Rendered in the Data tab; owns backup and export. */
  dataSlot?: ReactNode
  onClose: () => void
  settings: SettingsValue
  updateSetting: <K extends keyof SettingsValue>(
    key: K,
    value: SettingsValue[K],
  ) => void
}

export function SettingsModal({
  customBackground,
  dataSlot,
  onClose,
  settings,
  updateSetting,
}: SettingsModalProps) {
  const { t } = useTranslation()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance')
  const currentPattern = settings.backgroundPattern
  const currentOpacity = settings.backgroundOpacity
  const usesCustomBackground = settings.backgroundImage === customBackgroundValue

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

  const tabs: Array<{ id: SettingsTab; icon: 'image' | 'chat' | 'save'; label: string }> = [
    { id: 'appearance', icon: 'image', label: t('settings.tabAppearance') },
    { id: 'language', icon: 'chat', label: t('settings.tabLanguage') },
    { id: 'data', icon: 'save', label: t('settings.tabData') },
  ]

  function pickFile() {
    fileInputRef.current?.click()
  }

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
            {t('settings.title')}
          </h2>
          <button
            aria-label={t('settings.close')}
            className="sn-icon-button"
            onClick={onClose}
            title={t('action.close')}
            type="button"
          >
            <UiIcon name="close" />
          </button>
        </header>

        <div
          aria-label={t('settings.sections')}
          className="sn-settings-tabs"
          role="tablist"
        >
          {tabs.map((tab) => (
            <button
              aria-selected={activeTab === tab.id}
              className="sn-settings-tab"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              type="button"
            >
              <UiIcon name={tab.icon} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="sn-settings-modal__body">
          {activeTab === 'appearance' ? (
            <>
              <section className="sn-settings-section">
                <div className="sn-settings-section__label" id="sn-background-pattern-label">
                  {t('settings.pattern')}
                </div>
                <p className="sn-settings-section__hint">{t('settings.patternHint')}</p>
                <div
                  aria-labelledby="sn-background-pattern-label"
                  className="sn-pattern-picker"
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
                      <span>{t(PATTERN_LABEL_KEYS[option.value])}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="sn-settings-section">
                <div className="sn-settings-section__label" id="sn-background-opacity-label">
                  {t('settings.opacity')}
                  <strong>{currentOpacity}%</strong>
                </div>
                <p className="sn-settings-section__hint">{t('settings.opacityHint')}</p>
                <input
                  aria-labelledby="sn-background-opacity-label"
                  className="sn-opacity-range"
                  max={100}
                  min={0}
                  onChange={(event) =>
                    updateSetting('backgroundOpacity', Number(event.target.value))
                  }
                  type="range"
                  value={currentOpacity}
                />
              </section>

              <section className="sn-settings-section">
                <div className="sn-settings-section__label" id="sn-background-picker-label">
                  {t('settings.background')}
                </div>
                <p className="sn-settings-section__hint">{t('settings.backgroundHint')}</p>

                <div
                  aria-labelledby="sn-background-picker-label"
                  className="sn-background-picker"
                  role="radiogroup"
                >
                  {/*
                    The uploaded image leads the grid so it is reachable without
                    scrolling past two dozen bundled ones.
                  */}
                  {customBackground.url ? (
                    <button
                      aria-checked={usesCustomBackground}
                      aria-label={t('settings.backgroundCustom')}
                      className="sn-background-option sn-background-option--custom"
                      onClick={() => updateSetting('backgroundImage', customBackgroundValue)}
                      role="radio"
                      style={
                        {
                          '--sn-background-preview': `url("${customBackground.url}")`,
                        } as CSSProperties
                      }
                      title={t('settings.backgroundCustom')}
                      type="button"
                    >
                      <span aria-hidden="true" className="sn-background-option__swatch" />
                    </button>
                  ) : null}

                  {backgroundImageOptions.map((option) => (
                    <button
                      aria-checked={settings.backgroundImage === option.value}
                      aria-label={option.value ? option.label : t('settings.backgroundNone')}
                      className="sn-background-option"
                      data-empty={option.value === null}
                      key={option.label}
                      onClick={() => updateSetting('backgroundImage', option.value)}
                      role="radio"
                      style={
                        option.value
                          ? ({
                              '--sn-background-preview': `url("${option.value}")`,
                            } as CSSProperties)
                          : undefined
                      }
                      title={option.value ? option.label : t('settings.backgroundNone')}
                      type="button"
                    >
                      <span aria-hidden="true" className="sn-background-option__swatch">
                        {option.value === null ? <UiIcon name="close" /> : null}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="sn-custom-background">
                  <button
                    className="sn-custom-background__action"
                    disabled={customBackground.isBusy}
                    onClick={pickFile}
                    type="button"
                  >
                    <UiIcon name="image" />
                    {customBackground.url
                      ? t('settings.backgroundReplace')
                      : t('settings.backgroundUpload')}
                  </button>
                  {customBackground.url ? (
                    <button
                      className="sn-custom-background__action"
                      disabled={customBackground.isBusy}
                      onClick={customBackground.onRemove}
                      type="button"
                    >
                      <UiIcon name="trash" />
                      {t('settings.backgroundRemove')}
                    </button>
                  ) : null}
                  <input
                    accept={supportedBackgroundMimeTypes.join(',')}
                    className="sn-sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0]

                      if (file) {
                        // A fresh attempt should not sit under the last one's
                        // complaint.
                        customBackground.onDismissError()
                        customBackground.onUpload(file)
                      }

                      // Cleared so picking the same file twice fires again.
                      event.target.value = ''
                    }}
                    ref={fileInputRef}
                    type="file"
                  />
                </div>
                <p className="sn-settings-section__hint">
                  {t('settings.backgroundCustomHint')}
                </p>

                {customBackground.error ? (
                  <p className="sn-settings-error" role="alert">
                    {t(BACKGROUND_ERROR_KEYS[customBackground.error], {
                      limit: Math.round(customBackgroundMaxBytes / (1024 * 1024)),
                    })}
                  </p>
                ) : null}

                {/* Any image can flatten the sheet against the case, so the
                    caution shows once one is picked rather than never. */}
                {settings.backgroundImage ? (
                  <p className="sn-settings-section__hint sn-settings-section__hint--caution">
                    {t('settings.backgroundReadability')}
                  </p>
                ) : null}
              </section>
            </>
          ) : null}

          {activeTab === 'language' ? (
            <section className="sn-settings-section">
              <div className="sn-settings-section__label" id="sn-language-label">
                {t('settings.language')}
              </div>
              <p className="sn-settings-section__hint">{t('settings.languageHint')}</p>
              <div
                aria-labelledby="sn-language-label"
                className="sn-language-options"
                role="radiogroup"
              >
                {locales.map((option) => (
                  <button
                    aria-checked={settings.locale === option}
                    className="sn-language-option"
                    data-active={settings.locale === option}
                    key={option}
                    onClick={() => updateSetting('locale', option)}
                    role="radio"
                    type="button"
                  >
                    {localeLabels[option]}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {activeTab === 'data' ? dataSlot : null}
        </div>
      </div>
    </dialog>
  )

  return createPortal(modalContent, document.body)
}
