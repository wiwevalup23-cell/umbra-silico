import { CompassIcon, type CompassIconName } from '@/ui/icons/compass/CompassIcon'
import {
  compassCoreStatusIcons,
  compassCustomStatusIcons,
} from '@/ui/icons/compass/compass-icon-paths'
import { LegacyStatusGlyph } from '@/ui/icons/status/LegacyStatusGlyph'
import { legacyStatusGlyphs } from '@/ui/icons/status/legacy-status-glyph-symbols'

type StatusGlyphProps = {
  className?: string
  symbol: string
}

const knownStatusGlyphs = new Set<string>([
  ...Object.keys(compassCoreStatusIcons),
  ...Object.keys(compassCustomStatusIcons),
])

export function StatusGlyph({ className, symbol }: StatusGlyphProps) {
  if (knownStatusGlyphs.has(symbol)) {
    return <CompassIcon className={className} name={symbol as CompassIconName} />
  }

  if (legacyStatusGlyphs.has(symbol)) {
    return <LegacyStatusGlyph className={className} symbol={symbol} />
  }

  return <span className={className}>{symbol}</span>
}
