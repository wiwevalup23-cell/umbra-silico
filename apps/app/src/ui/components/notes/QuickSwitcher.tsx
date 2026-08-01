import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { NoteId, NoteListItem } from '@/shared/contracts/note'
import { RetroDialogShell } from '@/ui/components/silicon'
import { UiIcon, type UiIconName } from '@/ui/icons/ui/UiIcon'
import { useTranslation } from '@/ui/i18n/use-translation'

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
  group: 'actions' | 'notes'
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
  const { t } = useTranslation()
  const listboxId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [query, setQuery] = useState('')
  const search = query.trim().toLocaleLowerCase()

  const items = useMemo<SwitcherItem[]>(() => {
    const noteItems = notes.map((note) => ({
      description: note.isLocked
        ? t('switcher.encryptedNote')
        : note.preview || (note.tags?.length ? note.tags.join(' · ') : t('switcher.emptyNote')),
      group: 'notes' as const,
      icon: note.isLocked ? 'lock' as const : 'document' as const,
      id: `note-${note.id}`,
      label: note.title || t('note.untitled'),
      run: () => onSelectNote(note.id),
      searchText: `${note.title} ${note.preview} ${(note.tags ?? []).join(' ')}`.toLocaleLowerCase(),
    }))
    const actionItems: SwitcherItem[] = [
      {
        description: t('switcher.newBlankHint'),
        group: 'actions',
        icon: 'plus',
        id: 'action-new',
        label: t('switcher.newBlank'),
        run: onCreateBlank,
        searchText: 'new blank note create page',
      },
      {
        description: t('switcher.newTemplateHint'),
        group: 'actions',
        icon: 'template',
        id: 'action-template',
        label: t('switcher.newTemplate'),
        run: onOpenTemplates,
        searchText: 'new template daily meeting project',
      },
      {
        description: t('switcher.openTrashHint'),
        group: 'actions',
        icon: 'trash',
        id: 'action-trash',
        label: t('switcher.openTrash'),
        run: onOpenTrash,
        searchText: 'open trash deleted restore remove',
      },
      {
        description: t('switcher.settingsHint'),
        group: 'actions',
        icon: 'settings',
        id: 'action-settings',
        label: t('shell.settings'),
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
  }, [notes, onCreateBlank, onOpenSettings, onOpenTemplates, onOpenTrash, onSelectNote, search, t])

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
      title={t('switcher.title')}
    >
      <section className="sn-command-window sn-quick-switcher">
        <header className="sn-command-window__header sn-command-window__header--search">
          <UiIcon name="search" />
          <label className="sr-only" htmlFor="quick-switcher-search" id="quick-switcher-title">
            {t('switcher.title')}
          </label>
          <input
            aria-activedescendant={items[activeIndex] ? `${listboxId}-${items[activeIndex].id}` : undefined}
            aria-controls={listboxId}
            aria-describedby="quick-switcher-hint"
            autoComplete="off"
            id="quick-switcher-search"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyboardNavigation}
            placeholder={t('switcher.placeholder')}
            ref={inputRef}
            role="combobox"
            type="search"
            value={query}
          />
          <kbd className="sn-command-window__desktop-hint" id="quick-switcher-hint">Esc</kbd>
          <button
            aria-label={t('switcher.close')}
            className="sn-command-window__mobile-close"
            onClick={onClose}
            type="button"
          >
            {t('action.close')}
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
                    {t(
                      item.group === 'notes'
                        ? query
                          ? 'switcher.groupNotes'
                          : 'switcher.recentNotes'
                        : 'switcher.groupActions',
                    )}
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
