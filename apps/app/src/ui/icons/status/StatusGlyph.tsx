type StatusGlyphProps = {
  className?: string
  symbol: string
}

const knownStatusGlyphs = new Set([
  'idle',
  'beacon',
  'orbit',
  'eclipse',
  'ripple',
  'cipher',
  'flag',
  'loop',
  'vault',
  'seal',
])

export function StatusGlyph({ className, symbol }: StatusGlyphProps) {
  if (!knownStatusGlyphs.has(symbol)) {
    return <span className={className}>{symbol}</span>
  }

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.65"
      viewBox="0 0 24 24"
    >
      {symbol === 'idle' ? <circle cx="12" cy="12" r="5.6" /> : null}

      {symbol === 'beacon' ? (
        <>
          <path d="M12 10v9M9.4 19h5.2M9.9 10.8 12 8.7l2.1 2.1" />
          <path d="M7.5 8.5a6.4 6.4 0 0 1 0-4.4M16.5 8.5a6.4 6.4 0 0 0 0-4.4" />
          <path d="M5 11a10.1 10.1 0 0 1 0-9M19 11a10.1 10.1 0 0 0 0-9" />
        </>
      ) : null}

      {symbol === 'orbit' ? (
        <>
          <ellipse cx="12" cy="12" rx="8.6" ry="3.7" transform="rotate(-34 12 12)" />
          <circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none" />
          <circle cx="17.2" cy="7.3" r="1.15" fill="currentColor" stroke="none" />
        </>
      ) : null}

      {symbol === 'eclipse' ? (
        <>
          <circle cx="12" cy="12" r="7.4" />
          <path d="M12 4.6a7.4 7.4 0 1 0 0 14.8 5.5 5.5 0 0 1 0-14.8Z" fill="currentColor" stroke="none" />
          <path d="M17.2 5.3 18 3.7M19.2 8.4l1.7-.3" />
        </>
      ) : null}

      {symbol === 'ripple' ? (
        <>
          <path d="M4.5 9.3c2.2-2.1 4.6-2.1 6.8 0s4.6 2.1 8.2 0" />
          <path d="M4.5 14.7c2.2-2.1 4.6-2.1 6.8 0s4.6 2.1 8.2 0" />
          <circle cx="12" cy="5.1" r="1.2" fill="currentColor" stroke="none" />
        </>
      ) : null}

      {symbol === 'cipher' ? (
        <>
          <path d="m12 3.8 6.8 4v8.4l-6.8 4-6.8-4V7.8l6.8-4Z" />
          <path d="m9 9.2 6 5.6M15 9.2l-6 5.6" />
          <circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" />
        </>
      ) : null}

      {symbol === 'flag' ? (
        <>
          <path d="M6.5 20V4.1" />
          <path d="M7 5c3.6-1.8 5.6 2.1 9.7.1v7.1c-4.1 2-6.1-1.9-9.7-.1" />
          <path d="M4.8 20h3.4" />
        </>
      ) : null}

      {symbol === 'loop' ? (
        <>
          <path d="M19.4 9.4A7.7 7.7 0 0 0 6.7 6.8L4.5 9" />
          <path d="m4.7 5.9-.2 3.2 3.2-.2" />
          <path d="M4.6 14.6a7.7 7.7 0 0 0 12.7 2.6l2.2-2.2" />
          <path d="m19.3 18.1.2-3.2-3.2.2" />
        </>
      ) : null}

      {symbol === 'vault' ? (
        <>
          <rect x="4.3" y="5.2" width="15.4" height="13.6" rx="1.8" />
          <circle cx="12" cy="12" r="3.1" />
          <path d="M12 8.9v6.2M8.9 12h6.2M6.6 7.5h.01M17.4 16.5h.01" />
        </>
      ) : null}

      {symbol === 'seal' ? (
        <>
          <path d="m12 3.7 2.1 1.2 2.4-.1 1.2 2.1 2.1 1.2-.1 2.4 1.2 2.1-1.2 2.1.1 2.4-2.1 1.2-1.2 2.1-2.4-.1L12 20.3l-2.1 1.2-2.4-.1-1.2-2.1-2.1-1.2.1-2.4-1.2-2.1 1.2-2.1-.1-2.4 2.1-1.2 1.2-2.1 2.4.1L12 3.7Z" />
          <path d="m8.4 12.3 2.2 2.2 5-5" />
        </>
      ) : null}
    </svg>
  )
}
