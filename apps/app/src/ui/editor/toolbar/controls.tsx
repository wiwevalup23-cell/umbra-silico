import type { ReactNode } from 'react'
import type { TextAlignValue } from '../extensions'

export type ToolbarButtonProps = {
  children: ReactNode
  controls?: string
  disabled?: boolean
  expanded?: boolean
  label: string
  onPress: () => void
  pressed?: boolean
}

export function ToolbarButton({
  children,
  controls,
  disabled = false,
  expanded,
  label,
  onPress,
  pressed,
}: ToolbarButtonProps) {
  return (
    <button
      aria-controls={controls}
      aria-expanded={expanded}
      aria-label={label}
      aria-pressed={pressed}
      className="sn-editor-tool"
      data-active={pressed ?? false}
      disabled={disabled}
      onClick={onPress}
      title={label}
      type="button"
    >
      {children}
    </button>
  )
}

type MenuButtonProps = Omit<ToolbarButtonProps, 'children'> & {
  icon: ReactNode
}

/**
 * A row in the "more tools" menu: mark, then name.
 *
 * The visible name is the same translated string the button announces, which
 * is what keeps the menu in the user's language — it used to render hardcoded
 * English children beside a translated `aria-label`.
 */
export function MenuButton({
  disabled = false,
  icon,
  label,
  onPress,
  pressed = false,
}: MenuButtonProps) {
  return (
    <button
      aria-label={label}
      className="sn-editor-menu-button"
      data-active={pressed}
      disabled={disabled}
      onClick={onPress}
      title={label}
      type="button"
    >
      <span aria-hidden="true" className="sn-editor-menu-button__icon">{icon}</span>
      <span className="sn-editor-menu-button__label">{label}</span>
    </button>
  )
}

type LayoutNumberFieldProps = {
  disabled?: boolean
  label: string
  max: number
  min: number
  onCommit: (value: number) => void
  step?: number
  unit: string
  value: number
}

export function LayoutNumberField({
  disabled = false,
  label,
  max,
  min,
  onCommit,
  step = 1,
  unit,
  value,
}: LayoutNumberFieldProps) {
  function stepValue(direction: -1 | 1) {
    const next = Math.min(max, Math.max(min, value + direction * step))
    onCommit(Number(next.toFixed(2)))
  }

  return (
    <div className="sn-editor-page-settings__field">
      <span className="sn-editor-page-settings__name">{label}</span>
      <div aria-label={label} className="sn-editor-number-stepper" role="group">
        <button
          aria-label={`${label}: −`}
          disabled={disabled || value <= min}
          onClick={() => stepValue(-1)}
          type="button"
        >
          −
        </button>
        <input
          aria-label={label}
          className="sn-editor-tools-menu__number"
          defaultValue={value}
          disabled={disabled}
          key={value}
          max={max}
          min={min}
          onBlur={(event) => {
            const next = event.currentTarget.valueAsNumber
            onCommit(Number.isFinite(next) ? next : value)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            }
          }}
          step={step}
          type="number"
        />
        <button
          aria-label={`${label}: +`}
          disabled={disabled || value >= max}
          onClick={() => stepValue(1)}
          type="button"
        >
          +
        </button>
      </div>
      <span className="sn-editor-page-settings__unit">{unit}</span>
    </div>
  )
}

export function TextAlignmentGlyph({ alignment }: { alignment: TextAlignValue }) {
  return (
    <span
      aria-hidden="true"
      className="sn-text-alignment-glyph"
      data-alignment={alignment}
    >
      <i />
      <i />
      <i />
    </span>
  )
}
