import type { SVGProps } from 'react'

export type LegacyUiIconName =
  | 'chevronLeft'
  | 'chevronRight'
  | 'document'
  | 'focus'
  | 'lock'
  | 'plus'
  | 'refresh'
  | 'search'
  | 'settings'

const legacyPaths: Record<LegacyUiIconName, readonly string[]> = {
  chevronLeft: ['M15 18l-6-6 6-6'],
  chevronRight: ['M9 18l6-6-6-6'],
  document: [
    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
    'M14 2v6h6',
    'M8 13h8',
    'M8 17h6',
  ],
  focus: [
    'M8 3H5a2 2 0 0 0-2 2v3',
    'M16 3h3a2 2 0 0 1 2 2v3',
    'M21 16v3a2 2 0 0 1-2 2h-3',
    'M8 21H5a2 2 0 0 1-2-2v-3',
  ],
  lock: ['M7 11V8a5 5 0 0 1 10 0v3', 'M6 11h12v9H6z'],
  plus: ['M12 5v14', 'M5 12h14'],
  refresh: [
    'M21 12a9 9 0 0 1-15.4 6.4L3 16',
    'M3 21v-5h5',
    'M3 12a9 9 0 0 1 15.4-6.4L21 8',
    'M21 3v5h-5',
  ],
  search: ['M21 21l-4.3-4.3', 'M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4'],
  settings: [
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7',
    'M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1a2 2 0 0 1 0 4H21a1.7 1.7 0 0 0-1.6 1',
  ],
}

type LegacyUiIconProps = SVGProps<SVGSVGElement> & {
  name: LegacyUiIconName
  size?: number
}

export function LegacyUiIcon({ name, size = 18, ...props }: LegacyUiIconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      {legacyPaths[name].map((path) => <path d={path} key={path} />)}
    </svg>
  )
}
