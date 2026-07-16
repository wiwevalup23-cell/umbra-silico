import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { NoteId, NoteListItem } from '@/shared/contracts/note'
import { RetroDialogShell } from '@/ui/components/silicon'
import { UiIcon, type UiIconName } from '@/ui/icons/ui/UiIcon'

type QuickSwitcherProps = {
  notes: NoteListItem[]
  onClose: () => void
  onCreateBlank: () => void
  onOpenSettings: () => void
  onOpenTemplates: () => void
  onOpenTrash: () => void
  onSelectNote: (noteId: NoteId) => void
}

type SwitcherItem = {
  description: string
  group: 'Actions' | 'Notes'
  icon: UiIconName
  id: string
  label: string
  run: () => void
  searchText: string
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
  const listboxId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [query, setQuery] = useState('')
  const search = query.trim().toLocaleLowerCase()

  const items = useMemo<SwitcherItem[]>(() => {
    const noteItems = notes.map((note) => ({
      description: note.isLocked
        ? 'Encrypted note'
        : note.preview || (note.tags?.length ? note.tags.join(' · ') : 'Empty note'),
      group: 'Notes' as const,
      icon: note.isLocked ? 'lock' as const : 'document' as const,
      id: `note-${note.id}`,
      label: note.title || 'Untitled',
      run: () => onSelectNote(note.id),
      searchText: `${note.title} ${note.preview} ${(note.tags ?? []).join(' ')}`.toLocaleLowerCase(),
    }))
    const actionItems: SwitcherItem[] = [
      {
        description: 'Start with a clean page',
        group: 'Actions',
        icon: 'plus',
        id: 'action-new',
        label: 'New blank note',
        run: onCreateBlank,
        searchText: 'new blank note create page',
      },
      {
        description: 'Daily, meeting or project',
        group: 'Actions',
        icon: 'template',
        id: 'action-template',
        label: 'New from template',
        run: onOpenTemplates,
        searchText: 'new template daily meeting project',
      },
      {
        description: 'Restore or permanently remove notes',
        group: 'Actions',
        icon: 'trash',
        id: 'action-trash',
        label: 'Open trash',
        run: onOpenTrash,
        searchText: 'open trash deleted restore remove',
      },
      {
        description: 'Empty screen background',
        group: 'Actions',
        icon: 'settings',
        id: 'action-settings',
        label: 'Settings',
        run: onOpenSettings,
        searchText: 'settings preferences background appearance',
      },
    ]

    const filteredNotes = noteItems
      .filter((item) => !search || item.searchText.includes(search))
      .slice(0, 7)
    const filteredActions = actionItems.filter(
      (item) => !search || item.searchText.includes(search),
    )
    return [...filteredNotes, ...filteredActions]
  }, [notes, onCreateBlank, onOpenSettings, onOpenTemplates, onOpenTrash, onSelectNote, search])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    const item = itemRefs.current[activeIndex]
    if (typeof item?.scrollIntoView === 'function') {
      item.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex])

  function handleKeyboardNavigation(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }

    if (items.length === 0) return

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((index) => (index + direction + items.length) % items.length)
      return
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      setActiveIndex(event.key === 'Home' ? 0 : items.length - 1)
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      items[activeIndex]?.run()
    }
  }

  let renderedGroup: SwitcherItem['group'] | null = null

  return (
    <RetroDialogShell
      className="sn-modal--command"
      describedBy="quick-switcher-hint"
      initialFocusRef={inputRef}
      labelledBy="quick-switcher-title"
      onClose={onClose}
      showTitlebar={false}
      title="Quick switcher"
    >
      <section className="sn-command-window sn-quick-switcher">
        <header className="sn-command-window__header sn-command-window__header--search">
          <UiIcon name="search" />
          <label className="sr-only" htmlFor="quick-switcher-search" id="quick-switcher-title">
            Quick switcher
          </label>
          <input
            aria-activedescendant={items[activeIndex] ? `${listboxId}-${items[activeIndex].id}` : undefined}
            aria-controls={listboxId}
            aria-describedby="quick-switcher-hint"
            autoComplete="off"
            id="quick-switcher-search"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyboardNavigation}
            placeholder="Find a note or choose an action…"
            ref={inputRef}
            role="combobox"
            type="search"
            value={query}
          />
          <kbd className="sn-command-window__desktop-hint" id="quick-switcher-hint">Esc</kbd>
          <button
            aria-label="Close quick switcher"
            className="sn-command-window__mobile-close"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </header>

        <div className="sn-command-list" id={listboxId} role="listbox">
          {items.length > 0 ? items.map((item, index) => {
            const showGroup = renderedGroup !== item.group
            renderedGroup = item.group
            return (
              <div className="sn-command-result" key={item.id}>
                {showGroup ? (
                  <span className="sn-command-list__label">
                    {item.group === 'Notes' && !query ? 'Recent notes' : item.group}
                  </span>
                ) : null}
                <button
                  aria-selected={index === activeIndex}
                  className="sn-command-item"
                  data-active={index === activeIndex}
                  id={`${listboxId}-${item.id}`}
                  onClick={item.run}
                  onMouseMove={() => setActiveIndex(index)}
                  ref={(element) => {
                    itemRefs.current[index] = element
                  }}
                  role="option"
                  type="button"
                >
                  <UiIcon name={item.icon} />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  <UiIcon name="chevronRight" />
                </button>
              </div>
            )
          }) : (
            <p className="sn-command-empty">No notes or actions match “{query}”.</p>
          )}
        </div>
      </section>
    </RetroDialogShell>
  )
}
