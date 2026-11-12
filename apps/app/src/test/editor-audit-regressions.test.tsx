import 'fake-indexeddb/auto'
import { StrictMode, act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDexieNotesStore } from '@/local-store/dexie/dexie-notes-store'
import { DefaultNoteRepository } from '@/repository/note-repository'
import { createDraftLocalNote, deviceIdSchema, noteIdSchema, userIdSchema } from '@/shared/contracts'
import { NoteList } from '@/ui/components/notes/NoteList'
import { EditorShell } from '@/ui/editor'
import { RepositoryProvider } from '@/viewmodel/repository-provider'
import { useNotesSearchViewModel } from '@/viewmodel/notes-view-model'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const cleanups: Array<() => void> = []
let counter = 0

function render(children: ReactNode) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => root.render(<StrictMode>{children}</StrictMode>))
  cleanups.push(() => { act(() => root.unmount()); container.remove() })
  return container
}

function fill(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  act(() => {
    const prototype = input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function until(check: () => boolean) {
  for (let attempt = 0; attempt < 40 && !check(); attempt += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
  }
  expect(check()).toBe(true)
}

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.()
  vi.restoreAllMocks()
})

describe('editor audit regressions', () => {
  it('restores real repository results on clear, Escape and ordinary field clearing', async () => {
    counter += 1
    const repository = new DefaultNoteRepository({
      localStore: createDexieNotesStore({ databaseName: `audit-search-${counter}` }),
      userId: 'local_user', deviceId: 'audit_device',
    })
    const id = await repository.createNote({ title: 'Кириллица <>&' })
    function SearchLibrary() {
      const model = useNotesSearchViewModel()
      return <NoteList
        activeNoteId={id} activeNoteTitle="Кириллица <>&"
        notes={model.notes} searchQuery={model.searchQuery}
        isSearchPending={model.isSearchPending} onSearchChange={model.setSearchQuery}
        onCreateNote={() => {}} onSelectNote={() => {}} onOpenLockedNote={() => {}}
      />
    }
    const container = render(<RepositoryProvider repository={repository}><SearchLibrary /></RepositoryProvider>)
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!
    await until(() => container.querySelectorAll('.sn-note-list > li').length === 1)

    for (const clear of ['button', 'escape', 'input'] as const) {
      fill(input, 'неттакогослова')
      expect(container.textContent).toContain('Searching…')
      expect(container.textContent).not.toContain('No matching notes')
      await until(() => container.textContent?.includes('No matching notes') ?? false)
      expect(container.textContent).toContain('Results: 0')
      expect(container.querySelector('.sn-search-context')?.textContent).toContain('Кириллица <>&')
      expect(container.querySelector('.sn-search-context')?.textContent).toContain('still open in the editor')

      if (clear === 'button') {
        act(() => container.querySelector<HTMLButtonElement>('.sn-search-clear')!.click())
        expect(document.activeElement).toBe(input)
      } else if (clear === 'escape') {
        act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
      } else {
        fill(input, '')
      }
      expect(input.value).toBe('')
      await until(() => container.querySelectorAll('.sn-note-list > li').length === 1)
      expect(container.querySelector('.sn-search-context')).toBeNull()
      expect(container.textContent).not.toContain('No matching notes')
    }

    // Clear during the debounce too: the abandoned timer must not reapply it.
    fill(input, 'another missing query')
    act(() => container.querySelector<HTMLButtonElement>('.sn-search-clear')!.click())
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 220)) })
    expect(input.value).toBe('')
    expect(container.querySelectorAll('.sn-note-list > li')).toHaveLength(1)
  })

  it('keeps manual save reachable when blur starts a slow autosave, and after it completes', async () => {
    const note = createDraftLocalNote({
      id: noteIdSchema.parse('audit_save'), deviceId: deviceIdSchema.parse('audit_device'),
      userId: userIdSchema.parse('audit_user'), title: 'Original', now: '2026-11-12T10:00:00Z',
    })
    let finish!: (revision: number) => void
    const saveTitle = vi.fn(() => new Promise<number>((resolve) => { finish = resolve }))
    const container = render(<EditorShell note={note} onChangeTitle={saveTitle} onChangeDocument={async () => 1} />)
    const input = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Note title"]')!
    const save = container.querySelector<HTMLButtonElement>('button[aria-label="Save note"]')!
    expect(save.disabled).toBe(false)
    act(() => save.click())
    expect(saveTitle).not.toHaveBeenCalled()

    act(() => input.focus())
    fill(input, 'New title')
    expect(container.textContent).toContain('Unsaved')
    expect(save.disabled).toBe(false)
    act(() => input.blur())
    expect(saveTitle).toHaveBeenCalledWith(note.id, 'New title')
    expect(container.textContent).toContain('Saving')
    expect(save.disabled).toBe(false)
    expect(save.getAttribute('aria-busy')).toBe('true')
    act(() => save.click())
    expect(saveTitle).toHaveBeenCalledOnce()
    await act(async () => { finish(1); await Promise.resolve() })
    expect(save.disabled).toBe(false)
    expect(save.getAttribute('aria-busy')).toBe('false')
    expect(container.querySelector('.sn-editor-status-badges')?.textContent).toContain('Saved')
    act(() => save.click())
    expect(saveTitle).toHaveBeenCalledOnce()
  })
})
