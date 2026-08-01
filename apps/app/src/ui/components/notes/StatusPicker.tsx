import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { NotePropertyStatus } from '@/shared/contracts'
import {
  createCustomPropertyStatus,
  customStatusIconOptions,
  getPropertyStatusPresentation,
  parseCustomPropertyStatus,
  propertyStatusOptions,
  type PropertyStatusPresentation,
} from '@/ui/note-property-presentation'
import { useTranslation } from '@/ui/i18n/use-translation'
import { StatusGlyph } from '@/ui/icons/status/StatusGlyph'
import { UiIcon } from '@/ui/icons/ui/UiIcon'

type StatusPickerProps = {
  disabled?: boolean
  onChange: (status: NotePropertyStatus) => void
  value: NotePropertyStatus
}

const CUSTOM_STATUSES_STORAGE_KEY = 'umbra-silico-custom-statuses'

function readCustomStatuses(): PropertyStatusPresentation[] {
  try {
    const stored = window.localStorage.getItem(CUSTOM_STATUSES_STORAGE_KEY)
    const values: unknown = stored ? JSON.parse(stored) : []
    if (!Array.isArray(values)) return []

    return values
      .filter((value): value is NotePropertyStatus => typeof value === 'string')
      .map((value) => parseCustomPropertyStatus(value))
      .filter((option): option is PropertyStatusPresentation => option !== null)
      .slice(0, 12)
  } catch {
    return []
  }
}

function writeCustomStatuses(statuses: readonly PropertyStatusPresentation[]) {
  try {
    window.localStorage.setItem(
      CUSTOM_STATUSES_STORAGE_KEY,
      JSON.stringify(statuses.map((status) => status.value)),
    )
  } catch {
    // A private browser context can deny storage. The status still remains on
    // the note because its label and symbol are encoded in the status value.
  }
}

function mergeCustomStatuses(
  saved: readonly PropertyStatusPresentation[],
  current: NotePropertyStatus,
): PropertyStatusPresentation[] {
  const selected = parseCustomPropertyStatus(current)
  const merged = selected ? [selected, ...saved] : [...saved]
  return merged.filter((option, index, items) =>
    items.findIndex((candidate) => candidate.value === option.value) === index,
  )
}

export function StatusPicker({ disabled = false, onChange, value }: StatusPickerProps) {
  const { t } = useTranslation()
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [customStatuses, setCustomStatuses] = useState(readCustomStatuses)
  const [activeIndex, setActiveIndex] = useState(0)
  const [isCreating, setIsCreating] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [newStatusIcon, setNewStatusIcon] = useState<string>(customStatusIconOptions[0].icon)
  const [newStatusLabel, setNewStatusLabel] = useState('')
  const options = useMemo(
    () => [...propertyStatusOptions, ...mergeCustomStatuses(customStatuses, value)],
    [customStatuses, value],
  )
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value))
  const selectedOption = getPropertyStatusPresentation(value)

  useEffect(() => {
    setActiveIndex(selectedIndex)
  }, [selectedIndex])

  useEffect(() => {
    if (!isOpen || isCreating) return

    const focusFrame = window.requestAnimationFrame(() => {
      optionRefs.current[activeIndex]?.focus()
    })
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
        setIsCreating(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [activeIndex, isCreating, isOpen])

  useEffect(() => {
    if (!isOpen || !isCreating) return
    nameInputRef.current?.focus()
  }, [isCreating, isOpen])

  function close() {
    setIsOpen(false)
    setIsCreating(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  function openAt(index: number) {
    setActiveIndex(index)
    setIsCreating(false)
    setIsOpen(true)
  }

  function select(index: number) {
    const option = options[index]
    if (!option) return
    onChange(option.value)
    close()
  }

  function handleListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      const nextIndex = (activeIndex + direction + options.length) % options.length
      setActiveIndex(nextIndex)
      optionRefs.current[nextIndex]?.focus()
      return
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      const nextIndex = event.key === 'Home' ? 0 : options.length - 1
      setActiveIndex(nextIndex)
      optionRefs.current[nextIndex]?.focus()
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      select(activeIndex)
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  }

  function createStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const label = newStatusLabel.trim().replace(/\s+/g, ' ')
    if (!label) return

    const value = createCustomPropertyStatus(label, newStatusIcon)
    const presentation = parseCustomPropertyStatus(value)
    if (!presentation) return

    const nextStatuses = mergeCustomStatuses([presentation, ...customStatuses], value)
    setCustomStatuses(nextStatuses)
    writeCustomStatuses(nextStatuses)
    onChange(value)
    setNewStatusLabel('')
    close()
  }

  return (
    <div className="sn-status-picker" ref={rootRef}>
      <button
        aria-label={t('status.pageStatus')}
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className="sn-status-picker__trigger"
        disabled={disabled}
        onClick={() => isOpen ? close() : openAt(selectedIndex)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            openAt(event.key === 'ArrowDown'
              ? (selectedIndex + 1) % options.length
              : (selectedIndex - 1 + options.length) % options.length)
          }
        }}
        ref={triggerRef}
        type="button"
      >
        <span aria-hidden="true" className="sn-property-status-icon" data-tone={selectedOption.value}>
          <StatusGlyph symbol={selectedOption.icon} />
        </span>
        <span>{selectedOption.labelKey ? t(selectedOption.labelKey) : selectedOption.label}</span>
        <UiIcon name="chevronDown" />
      </button>
      {isOpen ? (
        <div className="sn-status-picker__popover">
          {isCreating ? (
            <form aria-label={t('status.createStatusForm')} className="sn-status-creator" onSubmit={createStatus}>
              <div className="sn-status-picker__label">{t('status.newPageStatus')}</div>
              <label className="sn-status-creator__name">
                <span>{t('status.name')}</span>
                <input
                  maxLength={32}
                  onChange={(event) => setNewStatusLabel(event.target.value)}
                  placeholder={t('status.namePlaceholder')}
                  ref={nameInputRef}
                  required
                  value={newStatusLabel}
                />
              </label>
              <fieldset className="sn-status-symbols">
                <legend>{t('status.chooseSymbol')}</legend>
                <div>
                  {customStatusIconOptions.map((option) => (
                    <button
                      aria-label={t(option.labelKey)}
                      aria-pressed={newStatusIcon === option.icon}
                      key={option.icon}
                      onClick={() => setNewStatusIcon(option.icon)}
                      title={t(option.labelKey)}
                      type="button"
                    >
                      <StatusGlyph symbol={option.icon} />
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="sn-status-creator__actions">
                <button onClick={() => setIsCreating(false)} type="button">{t('status.back')}</button>
                <button type="submit">{t('status.addStatus')}</button>
              </div>
            </form>
          ) : (
            <>
              <div
                aria-activedescendant={`${listboxId}-${options[activeIndex]?.value}`}
                id={listboxId}
                onKeyDown={handleListKeyDown}
                role="listbox"
              >
                <span className="sn-status-picker__label">{t('status.pageStatus')}</span>
                {options.map((option, index) => (
                  <button
                    aria-selected={option.value === value}
                    className="sn-status-picker__option"
                    data-active={index === activeIndex}
                    id={`${listboxId}-${option.value}`}
                    key={option.value}
                    onClick={() => select(index)}
                    ref={(element) => {
                      optionRefs.current[index] = element
                    }}
                    role="option"
                    tabIndex={index === activeIndex ? 0 : -1}
                    type="button"
                  >
                    <span aria-hidden="true" className="sn-property-status-icon" data-tone={option.value}>
                      <StatusGlyph symbol={option.icon} />
                    </span>
                    <span>{option.labelKey ? t(option.labelKey) : option.label}</span>
                    {option.value === value ? <UiIcon name="check" /> : null}
                  </button>
                ))}
              </div>
              <button
                className="sn-status-picker__create"
                onClick={() => setIsCreating(true)}
                type="button"
              >
                <span aria-hidden="true">＋</span>
                {t('status.createStatus')}
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
