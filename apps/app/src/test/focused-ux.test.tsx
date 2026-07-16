import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createDraftLocalNote,
  deviceIdSchema,
  noteIdSchema,
  noteTemplates,
  userIdSchema,
  type NoteListItem,
} from '@/shared'
import {
  QuickSwitcher,
  TemplatePicker,
  WorkspaceInspector,
} from '@/ui/components/notes'
import { MobileTabBar } from '@/ui/components/silicon'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const cleanupTasks: Array<() => void> = []
const noteId = noteIdSchema.parse('note_focused_ux')
const now = '2026-07-16T12:00:00.000Z'

function renderUi(children: ReactNode) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => root.render(children))
  return {
    container,
    cleanup() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

afterEach(() => {
  while (cleanupTasks.length) cleanupTasks.pop()?.()
})

describe('focused product UX', () => {
  const notes: NoteListItem[] = [{
    id: noteId,
    isLocked: false,
    parentFolderId: null,
    preview: 'A compact research page',
    propertyStatus: 'idea',
    syncStatus: 'synced',
    tags: ['Research'],
    title: 'Field notes',
    updatedAt: now,
  }]

  it('renders a real three-tab mobile navigation control', () => {
    const onTabChange = vi.fn()
    const rendered = renderUi(
      <MobileTabBar
        activeTab="editor"
        notes={notes}
        onTabChange={onTabChange}
        pendingOperations={0}
        syncStatus="idle"
      />,
    )
    cleanupTasks.push(rendered.cleanup)

    expect(rendered.container.querySelectorAll('.sn-tab-bar__tab')).toHaveLength(3)
    expect(rendered.container.querySelector('[aria-current="page"]')?.textContent).toContain('Editor')
    act(() => rendered.container.querySelector<HTMLButtonElement>('button[title="Details"]')?.click())
    expect(onTabChange).toHaveBeenCalledWith('details')
  })

  it('offers templates in a dedicated picker window', () => {
    const onSelect = vi.fn()
    const rendered = renderUi(
      <TemplatePicker onClose={vi.fn()} onSelect={onSelect} templates={noteTemplates} />,
    )
    cleanupTasks.push(rendered.cleanup)

    expect(rendered.container.textContent).toContain('Choose a starting point')
    expect(rendered.container.textContent).toContain('Daily note')
    act(() => Array.from(rendered.container.querySelectorAll('button')).find((button) => button.textContent?.includes('Meeting notes'))?.click())
    expect(onSelect).toHaveBeenCalledWith('meeting')
  })

  it('searches notes and exposes focused actions in the quick switcher', () => {
    const onSelectNote = vi.fn()
    const rendered = renderUi(
      <QuickSwitcher
        notes={notes}
        onClose={vi.fn()}
        onCreateBlank={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenTemplates={vi.fn()}
        onOpenTrash={vi.fn()}
        onSelectNote={onSelectNote}
      />,
    )
    cleanupTasks.push(rendered.cleanup)

    const input = rendered.container.querySelector<HTMLInputElement>('#quick-switcher-search')
    act(() => {
      if (input) setInputValue(input, 'research')
    })
    expect(rendered.container.textContent).toContain('Field notes')
    act(() => Array.from(rendered.container.querySelectorAll('button')).find((button) => button.textContent?.includes('Field notes'))?.click())
    expect(onSelectNote).toHaveBeenCalledWith(noteId)
  })

  it('edits persisted status and tags from the properties inspector', async () => {
    const onChangeProperties = vi.fn(async () => undefined)
    const note = createDraftLocalNote({
      id: noteId,
      userId: userIdSchema.parse('focused_user'),
      deviceId: deviceIdSchema.parse('focused_device'),
      now,
      properties: { status: 'idea', tags: ['Research'] },
    })
    const rendered = renderUi(
      <WorkspaceInspector
        activeNote={note}
        folderName="Notebook"
        noteCount={1}
        onChangeProperties={onChangeProperties}
      />,
    )
    cleanupTasks.push(rendered.cleanup)

    const statusTrigger = rendered.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Page status"]',
    )
    await act(async () => {
      statusTrigger?.click()
      await Promise.resolve()
    })
    const doneOption = Array.from(rendered.container.querySelectorAll<HTMLButtonElement>(
      '[role="option"]',
    )).find((option) => option.textContent?.includes('Done'))
    await act(async () => {
      doneOption?.click()
      await Promise.resolve()
    })
    expect(onChangeProperties).toHaveBeenCalledWith(noteId, {
      status: 'done',
      tags: ['Research'],
    })

    const input = rendered.container.querySelector<HTMLInputElement>('input[aria-label="New page tag"]')
    await act(async () => {
      if (input) setInputValue(input, 'Local')
      rendered.container.querySelector<HTMLFormElement>('.sn-tag-entry')?.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
    })
    expect(onChangeProperties).toHaveBeenCalledWith(noteId, {
      status: 'idea',
      tags: ['Research', 'Local'],
    })
  })
})
