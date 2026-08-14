import { CompassIcon, type CompassIconName } from '@/ui/icons/compass/CompassIcon'
import {
  compassCoreStatusIcons,
  compassCustomStatusIcons,
} from '@/ui/icons/compass/compass-icon-paths'
import { LegacyStatusGlyph } from '@/ui/icons/status/LegacyStatusGlyph'
import { legacyStatusGlyphs } from '@/ui/icons/status/legacy-status-glyph-symbols'
import { StatusMarkerGlyph } from '@/ui/icons/status-marker'
import { statusMarkerIconParts } from '@/ui/icons/status-marker/status-marker-icon-data'

type StatusGlyphProps = {
  className?: string
  symbol: string
}

const knownStatusGlyphs = new Set<string>([
  ...Object.keys(compassCoreStatusIcons),
  ...Object.keys(compassCustomStatusIcons),
])

const knownStatusMarkerGlyphs = new Set<string>(Object.keys(statusMarkerIconParts))

export function StatusGlyph({ className, symbol }: StatusGlyphProps) {
  if (knownStatusMarkerGlyphs.has(symbol)) {
    return (
      <StatusMarkerGlyph
        className={className}
        name={symbol as keyof typeof statusMarkerIconParts}
      />
    )
  }

  if (knownStatusGlyphs.has(symbol)) {
    return <CompassIcon className={className} name={symbol as CompassIconName} />
  }

  if (legacyStatusGlyphs.has(symbol)) {
    return <LegacyStatusGlyph className={className} symbol={symbol} />
  }

  return <span className={className}>{symbol}</span>
}
