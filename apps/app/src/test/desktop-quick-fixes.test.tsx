import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDraftLocalNote, deviceIdSchema, noteIdSchema, userIdSchema } from '@/shared/contracts'
import { FolderTree, NoteList, QuickSwitcher, WorkspaceInspector } from '@/ui/components/notes'
import { TranslationProvider } from '@/ui/i18n/TranslationProvider'
import { useWorkspaceLayout, type WorkspaceLayout } from '@/viewmodel/workspace-layout-view-model'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const cleanups: Array<() => void> = []

function render(children: ReactNode) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const rerender = (next: ReactNode) => act(() => root.render(
    <TranslationProvider locale="ru">{next}</TranslationProvider>,
  ))
  rerender(children)
  const cleanup = () => { act(() => root.unmount()); container.remove() }
  cleanups.push(cleanup)
  return { container, rerender }
}

function fill(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.()
  window.localStorage.removeItem('umbra.workspace.panels.v1')
  vi.unstubAllGlobals()
})

describe('desktop audit quick fixes', () => {
  it.each([
    ['настройки', 'settings'], ['оформление', 'settings'], ['фон', 'settings'],
    ['корзина', 'trash'], ['восстановить', 'trash'], ['шаблон', 'template'],
    ['settings', 'settings'], ['trash', 'trash'], ['template', 'template'],
  ])('finds and runs the command for %s', (query, command) => {
    const actions = { settings: vi.fn(), trash: vi.fn(), template: vi.fn() }
    const { container } = render(<QuickSwitcher
      notes={[]} onClose={vi.fn()} onCreateBlank={vi.fn()} onSelectNote={vi.fn()}
      onOpenSettings={actions.settings} onOpenTrash={actions.trash} onOpenTemplates={actions.template}
    />)
    const input = container.querySelector<HTMLInputElement>('input')!
    fill(input, query)
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(1)
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(actions[command as keyof typeof actions]).toHaveBeenCalledOnce()
  })

  it('distinguishes the global collection from a physical unfiled destination', () => {
    const select = vi.fn()
    const { container } = render(<FolderTree
      activeFolderId={undefined} nodes={[]} onCreateFolder={vi.fn()} onDeleteFolder={vi.fn()}
      onMoveNoteToFolder={vi.fn()} onRenameFolder={vi.fn()} onSelectFolder={select}
    />)
    const all = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Все заметки')!
    const unfiled = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Без папки')!
    expect(all.closest('[data-active]')?.getAttribute('data-active')).toBe('true')
    expect(unfiled.closest('[data-active]')?.getAttribute('data-active')).toBe('false')
    act(() => all.click())
    act(() => unfiled.click())
    expect(select.mock.calls).toEqual([[undefined], [null]])
  })

  it('labels scoped search and empty folders without claiming the library is empty', () => {
    const props = {
      activeNoteId: null, notes: [], onCreateNote: vi.fn(), onSelectNote: vi.fn(), onOpenLockedNote: vi.fn(),
    }
    const { container, rerender } = render(<NoteList {...props} scopeLabel="Черновики" scopePath="Проекты / Черновики" />)
    expect(container.querySelector('input')?.placeholder).toBe('Поиск в «Черновики»')
    expect(container.textContent).toContain('В этой папке пока нет заметок')
    expect(container.querySelector('details')?.open).toBe(false)
    expect(container.querySelector('details p')?.textContent).toBe('Проекты / Черновики')
    rerender(<NoteList {...props} isUnfiled scopeLabel="Без папки" />)
    expect(container.textContent).toContain('Нет заметок без папки')
    expect(container.textContent).not.toContain('Локальная библиотека ждёт')
    rerender(<NoteList {...props} />)
    expect(container.querySelector('input')?.placeholder).toBe('Поиск во всех заметках')
  })

  it('keeps selected markers visible and preserves them when closing the chooser', async () => {
    const note = createDraftLocalNote({
      id: noteIdSchema.parse('note_quick_markers'), userId: userIdSchema.parse('quick_user'),
      deviceId: deviceIdSchema.parse('quick_device'), now: '2026-09-11T10:00:00Z',
      properties: { kind: 'standard', markers: ['idea'], status: 'draft', tags: ['Аудит'] },
    })
    const save = vi.fn(async () => undefined)
    const { container } = render(<WorkspaceInspector activeNote={note} noteCount={1} onChangeProperties={save} />)
    const details = container.querySelector<HTMLDetailsElement>('.sn-marker-disclosure')!
    expect(details.open).toBe(false)
    expect(container.querySelector('.sn-selected-markers')?.textContent).toContain('Идея')
    expect(container.querySelector('.sn-tag-list')?.textContent).toContain('Аудит')
    act(() => details.querySelector('summary')!.click())
    expect(details.open).toBe(true)
    await act(async () => {
      details.querySelector<HTMLButtonElement>('button[aria-label="Важное"]')!.click()
    })
    act(() => details.querySelector('summary')!.click())
    expect(details.open).toBe(false)
    expect(container.querySelector('.sn-selected-markers')?.textContent).toContain('Важное')
    expect(save).toHaveBeenCalledWith(note.id, { ...note.properties, markers: ['idea', 'important'] })
  })
})

describe('focus layout restoration', () => {
  function harness(initialWidth = 1440) {
    let width = initialWidth
    const listeners = new Map<string, (event: MediaQueryListEvent) => void>()
    const matches = (query: string) => width <= Number(query.match(/\d+/)?.[0])
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: matches(query), media: query,
      addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => listeners.set(query, listener),
      removeEventListener: () => listeners.delete(query),
    }))
    let layout: WorkspaceLayout
    function Probe() { layout = useWorkspaceLayout(); return null }
    const rendered = render(<Probe />)
    return {
      get layout() { return layout! },
      resize(nextWidth: number) {
        width = nextWidth
        act(() => listeners.forEach((listener, query) => listener({ matches: matches(query) } as MediaQueryListEvent)))
      },
      remount() { rendered.rerender(null); rendered.rerender(<Probe />) },
    }
  }

  it.each([[false, false], [false, true], [true, false], [true, true]])(
    'restores library collapsed=%s, inspector collapsed=%s, including after remount', (library, inspector) => {
      const h = harness()
      act(() => { if (library) h.layout.collapseLibrary(); if (inspector) h.layout.collapseInspector() })
      act(() => h.layout.toggleFocus())
      expect(h.layout.isFocusLayout).toBe(true)
      expect(h.layout.isLibraryCollapsed && h.layout.isInspectorCollapsed).toBe(true)
      act(() => h.layout.toggleFocus())
      expect(h.layout.isLibraryCollapsed).toBe(library)
      expect(h.layout.isInspectorCollapsed).toBe(inspector)
      act(() => h.layout.toggleFocus())
      h.remount()
      expect(h.layout.isFocusLayout).toBe(false)
      expect(h.layout.isLibraryCollapsed).toBe(library)
      expect(h.layout.isInspectorCollapsed).toBe(inspector)
    },
  )

  it('does not reopen a compact overlay after focus or resize', () => {
    const h = harness()
    act(() => h.layout.toggleFocus())
    h.resize(1279)
    act(() => h.layout.toggleFocus())
    expect(h.layout.isInspectorCollapsed).toBe(true)
    act(() => h.layout.expandInspector())
    expect(h.layout.isInspectorCollapsed).toBe(false)
    act(() => h.layout.toggleFocus())
    act(() => h.layout.toggleFocus())
    expect(h.layout.isInspectorCollapsed).toBe(true)
    h.resize(1440)
    expect(h.layout.isInspectorCollapsed).toBe(false)
  })

  it('recovers from malformed persisted panel preferences', () => {
    window.localStorage.setItem('umbra.workspace.panels.v1', '{broken')
    const h = harness()
    expect(h.layout.isLibraryCollapsed).toBe(false)
    expect(h.layout.isInspectorCollapsed).toBe(false)
  })
})
