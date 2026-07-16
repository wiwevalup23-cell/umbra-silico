import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { NotePropertyStatus } from '@/shared/contracts'
import { UiIcon } from '@/ui/icons/ui/UiIcon'

const propertyStatusOptions: Array<{
  label: string
  tone: NotePropertyStatus
  value: NotePropertyStatus
}> = [
  { label: 'No status', tone: 'none', value: 'none' },
  { label: 'Idea', tone: 'idea', value: 'idea' },
  { label: 'In progress', tone: 'active', value: 'active' },
  { label: 'Done', tone: 'done', value: 'done' },
]

type StatusPickerProps = {
  disabled?: boolean
  onChange: (status: NotePropertyStatus) => void
  value: NotePropertyStatus
}

export function StatusPicker({ disabled = false, onChange, value }: StatusPickerProps) {
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = Math.max(
    0,
    propertyStatusOptions.findIndex((option) => option.value === value),
  )
  const [activeIndex, setActiveIndex] = useState(selectedIndex)
  const [isOpen, setIsOpen] = useState(false)
  const selectedOption = propertyStatusOptions[selectedIndex]

  useEffect(() => {
    setActiveIndex(selectedIndex)
  }, [selectedIndex])

  useEffect(() => {
    if (!isOpen) return

    const focusFrame = window.requestAnimationFrame(() => {
      optionRefs.current[activeIndex]?.focus()
    })
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [activeIndex, isOpen])

  function openAt(index: number) {
    setActiveIndex(index)
    setIsOpen(true)
  }

  function select(index: number) {
    const option = propertyStatusOptions[index]
    if (!option) return
    onChange(option.value)
    setIsOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  function handleListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      const nextIndex = (
        activeIndex + direction + propertyStatusOptions.length
      ) % propertyStatusOptions.length
      setActiveIndex(nextIndex)
      optionRefs.current[nextIndex]?.focus()
      return
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      const nextIndex = event.key === 'Home' ? 0 : propertyStatusOptions.length - 1
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
      setIsOpen(false)
      triggerRef.current?.focus()
    }
  }

  return (
    <div className="sn-status-picker" ref={rootRef}>
      <button
        aria-label="Page status"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className="sn-status-picker__trigger"
        disabled={disabled}
        onClick={() => isOpen ? setIsOpen(false) : openAt(selectedIndex)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            openAt(event.key === 'ArrowDown'
              ? (selectedIndex + 1) % propertyStatusOptions.length
              : (selectedIndex - 1 + propertyStatusOptions.length) % propertyStatusOptions.length)
          }
        }}
        ref={triggerRef}
        type="button"
      >
        <span className="sn-property-status-dot" data-tone={selectedOption.tone} />
        <span>{selectedOption.label}</span>
        <UiIcon name="chevronDown" />
      </button>
      {isOpen ? (
        <div
          aria-activedescendant={`${listboxId}-${propertyStatusOptions[activeIndex]?.value}`}
          className="sn-status-picker__popover"
          id={listboxId}
          onKeyDown={handleListKeyDown}
          role="listbox"
        >
          <span className="sn-status-picker__label">Page status</span>
          {propertyStatusOptions.map((option, index) => (
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
              <span className="sn-property-status-dot" data-tone={option.tone} />
              <span>{option.label}</span>
              {option.value === value ? <UiIcon name="check" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
