import type { SVGProps } from 'react'
import {
  statusMarkerIconParts,
  nocturneStatusMarkerSubstitutions,
  type StatusMarkerIconPart,
  type StatusMarkerIconName,
} from './status-marker-icon-data'

export type StatusMarkerGlyphProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  name: StatusMarkerIconName
  pack?: 'core' | 'nocturne'
  size?: number
}

export function StatusMarkerGlyph({ name, pack = 'core', size = 20, ...props }: StatusMarkerGlyphProps) {
  const resolvedName = pack === 'nocturne'
    ? nocturneStatusMarkerSubstitutions[name] ?? name
    : name
  const parts: readonly StatusMarkerIconPart[] = statusMarkerIconParts[resolvedName]

  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      {parts.map((part, index) => (
        <path
          d={part.d}
          fill={part.fill ?? 'none'}
          key={`${resolvedName}-${index}`}
          stroke={part.stroke ?? 'currentColor'}
        />
      ))}
    </svg>
  )
}
