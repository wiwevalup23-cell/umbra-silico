import { CompassIcon, type CompassIconName } from '@/ui/icons/compass/CompassIcon'
import {
  compassCoreStatusIcons,
  compassCustomStatusIcons,
} from '@/ui/icons/compass/compass-icon-paths'

type StatusGlyphProps = {
  className?: string
  symbol: string
}

const knownStatusGlyphs = new Set<string>([
  ...Object.keys(compassCoreStatusIcons),
  ...Object.keys(compassCustomStatusIcons),
])

export function StatusGlyph({ className, symbol }: StatusGlyphProps) {
  if (!knownStatusGlyphs.has(symbol)) {
    return <span className={className}>{symbol}</span>
  }

  return <CompassIcon className={className} name={symbol as CompassIconName} />
}
