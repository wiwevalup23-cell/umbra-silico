import { useEffect, useMemo, useRef, useState } from 'react'
import type { NoteId, NoteListItem } from '@/shared/contracts/note'
import { UiIcon } from '@/ui/icons/ui/UiIcon'

type QuickSwitcherProps = {
  notes: NoteListItem[]
  onClose: () => void
  onCreateBlank: () => void
  onOpenSettings: () => void
  onOpenTemplates: () => void
  onOpenTrash: () => void
  onSelectNote: (noteId: NoteId) => void
}

export function QuickSwitcher({
  notes,
  onClose,
  onCreateBlank,
  onOpenSettings,
  onOpenTemplates,
  onOpenTrash,
  onSelectNote,
}: QuickSwitcherProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const matches = useMemo(() => {
    const search = query.trim().toLocaleLowerCase()
    const available = notes
    if (!search) return available.slice(0, 7)
    return available
      .filter((note) => `${note.title} ${note.preview} ${(note.tags ?? []).join(' ')}`.toLocaleLowerCase().includes(search))
      .slice(0, 7)
  }, [notes, query])

  return (
    <div
      aria-labelledby="quick-switcher-title"
      aria-modal="true"
      className="sn-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="dialog"
    >
      <section className="sn-command-window sn-quick-switcher">
        <header className="sn-command-window__header sn-command-window__header--search">
          <UiIcon name="search" />
          <label className="sr-only" htmlFor="quick-switcher-search" id="quick-switcher-title">
            Quick switcher
          </label>
          <input
            id="quick-switcher-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a note or choose an action…"
            ref={inputRef}
            type="search"
            value={query}
          />
          <kbd>Esc</kbd>
        </header>

        <div className="sn-command-list">
          <span className="sn-command-list__label">{query ? 'Results' : 'Recent notes'}</span>
          {matches.length > 0 ? matches.map((note) => (
            <button
              className="sn-command-item"
              key={note.id}
              onClick={() => onSelectNote(note.id)}
              type="button"
            >
              <UiIcon name={note.isLocked ? 'lock' : 'document'} />
              <span>
                <strong>{note.title || 'Untitled'}</strong>
                <small>{note.isLocked ? 'Encrypted note' : note.preview || (note.tags?.length ? note.tags.join(' · ') : 'Empty note')}</small>
              </span>
              <UiIcon name="chevronRight" />
            </button>
          )) : (
            <p className="sn-command-empty">
              {query ? `No notes match “${query}”.` : 'No notes yet. Create one from the actions below.'}
            </p>
          )}

          {!query ? (
            <>
              <span className="sn-command-list__label">Actions</span>
              <button className="sn-command-item" onClick={onCreateBlank} type="button">
                <UiIcon name="plus" /><span><strong>New blank note</strong><small>Start with a clean page</small></span>
              </button>
              <button className="sn-command-item" onClick={onOpenTemplates} type="button">
                <UiIcon name="template" /><span><strong>New from template</strong><small>Daily, meeting or project</small></span>
              </button>
              <button className="sn-command-item" onClick={onOpenTrash} type="button">
                <UiIcon name="trash" /><span><strong>Open trash</strong><small>Restore or permanently remove notes</small></span>
              </button>
              <button className="sn-command-item" onClick={onOpenSettings} type="button">
                <UiIcon name="settings" /><span><strong>Settings</strong><small>Scale and visual background</small></span>
              </button>
            </>
          ) : null}
        </div>
      </section>
    </div>
  )
}
