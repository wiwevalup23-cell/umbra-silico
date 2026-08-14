import type { NotePropertyMarker } from '@/shared/contracts'
import { useTranslation } from '@/ui/i18n/use-translation'
import { StatusGlyph } from '@/ui/icons/status/StatusGlyph'
import { propertyMarkerOptions } from '@/ui/note-property-presentation'

type MarkerPickerProps = {
  disabled?: boolean
  onChange: (markers: NotePropertyMarker[]) => void
  value: NotePropertyMarker[]
}

export function MarkerPicker({ disabled = false, onChange, value }: MarkerPickerProps) {
  const { t } = useTranslation()
  const selected = new Set(value)

  return (
    <div className="sn-marker-picker" role="group" aria-label={t('marker.section')}>
      {propertyMarkerOptions.map((option) => {
        const isSelected = selected.has(option.value)
        const label = t(option.labelKey)

        return (
          <button
            aria-label={label}
            aria-pressed={isSelected}
            data-tone={`marker.${option.value}`}
            disabled={disabled}
            key={option.value}
            onClick={() => onChange(isSelected
              ? value.filter((marker) => marker !== option.value)
              : [...value, option.value])}
            title={label}
            type="button"
          >
            <StatusGlyph symbol={option.icon} />
            <span>{label}</span>
          </button>
        )
      })}
    </div>
  )
}
