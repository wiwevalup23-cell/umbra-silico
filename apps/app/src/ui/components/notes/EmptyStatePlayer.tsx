type EmptyStatePlayerProps = {
  onCreateNote: () => void
  pendingOperations: number
  syncStatus: string
}

export function EmptyStatePlayer({
  onCreateNote,
}: EmptyStatePlayerProps) {
  return (
    <div className="sn-empty-player" aria-label="Empty notebook player">
      <img
        alt=""
        aria-hidden="true"
        className="sn-empty-player__image"
        draggable={false}
        src="/assets/player-warm-cut.png"
      />

      <div className="sn-empty-player__screen" aria-live="polite">
        <div className="sn-empty-player__screen-content">
          <div aria-label="hello" className="sn-empty-player__hello" role="img">
            <svg
              aria-hidden="true"
              className="sn-empty-player__hello-guide"
              focusable="false"
              viewBox="0 0 520 185"
            >
              <path
                className="sn-empty-player__hello-line"
                d="M49 124 C67 103 81 74 88 42 C95 10 78 11 72 40 C64 78 61 124 78 129 C93 134 107 102 119 83 C129 67 143 68 148 81 C153 96 139 119 123 129 C144 135 172 124 186 100 C199 76 223 68 240 80 C260 95 251 126 229 137 C254 143 282 129 294 103 C307 73 321 36 326 15 C330 -1 347 1 343 23 C336 64 319 124 331 134 C342 143 360 116 372 92 C386 65 406 67 412 86 C418 105 401 129 382 137 C406 143 436 129 451 104 C462 86 479 82 489 91 C504 105 493 132 472 139 C490 143 506 135 515 121"
                pathLength="1"
              />
            </svg>
            <img
              alt=""
              aria-hidden="true"
              className="sn-empty-player__hello-final"
              draggable={false}
              src="/assets/hello-smooth.svg"
            />
          </div>

          <div className="sn-empty-player__screen-copy">
            <strong>Ready to record</strong>
            <span>Press play to create a new document</span>
          </div>
        </div>
      </div>

      <button
        aria-label="Create note"
        className="sn-empty-player__hotspot sn-empty-player__hotspot--play"
        onClick={onCreateNote}
        title="Create note"
        type="button"
      />
    </div>
  )
}
