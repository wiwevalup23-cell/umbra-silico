import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { noteIdSchema, type NoteListItem } from '@/shared'
import { LockModal, NoteCard, TrashView } from '@/ui/components/notes'
import {
  getLocalSavePresentation,
  getPersistencePresentation,
} from '@/ui/note-presentation'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const cleanupTasks: Array<() => void> = []
const noteId = noteIdSchema.parse('note_p0_ux')
const note: NoteListItem = {
  id: noteId,
  isLocked: false,
  parentFolderId: null,
  preview: 'A recoverable local note',
  syncStatus: 'dirty',
  title: 'Surgical checklist',
  updatedAt: '2026-07-16T12:00:00.000Z',
}

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

describe('P0 UX safeguards', () => {
  it('uses one honest persistence vocabulary for local and remote notes', () => {
    expect(getPersistencePresentation({ hasRemote: false, status: 'dirty' })).toMatchObject({
      icon: 'save',
      labelKey: 'state.savedLocally',
      tone: 'idle',
    })
    expect(getPersistencePresentation({ hasRemote: true, status: 'dirty' })).toMatchObject({
      icon: 'cloud',
      labelKey: 'state.pendingSync',
      tone: 'dirty',
    })
    expect(getLocalSavePresentation('queued').labelKey).toBe('state.unsavedLocally')
  })

  it('makes note deletion an explicit action instead of an invisible hit target', () => {
    const onDelete = vi.fn()
    const rendered = renderUi(<NoteCard note={note} onDelete={onDelete} />)
    cleanupTasks.push(rendered.cleanup)

    const trigger = rendered.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Note actions for Surgical checklist"]',
    )
    expect(trigger?.getAttribute('aria-expanded')).toBe('false')

    act(() => trigger?.click())
    const deleteAction = Array.from(rendered.container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Move to trash'))
    expect(deleteAction).toBeDefined()
    expect(onDelete).not.toHaveBeenCalled()

    act(() => deleteAction?.click())
    expect(onDelete).toHaveBeenCalledWith(noteId)
  })

  it('confirms permanent deletion in the product dialog with Cancel as the safe action', () => {
    const onPurge = vi.fn()
    const rendered = renderUi(
      <TrashView notes={[note]} onBack={vi.fn()} onPurge={onPurge} onRestore={vi.fn()} />,
    )
    cleanupTasks.push(rendered.cleanup)

    const deleteButton = Array.from(rendered.container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Delete forever'))
    act(() => deleteButton?.click())

    const dialog = rendered.container.querySelector('dialog')
    expect(dialog?.textContent).toContain('Surgical checklist')
    expect(dialog?.textContent).toContain('cannot be undone')
    expect(onPurge).not.toHaveBeenCalled()

    const confirmButton = Array.from(dialog?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent?.includes('Delete forever'))
    act(() => confirmButton?.click())
    expect(onPurge).toHaveBeenCalledWith(noteId)
  })

  it('requires a matching password confirmation before locking and supports reveal', () => {
    const onSubmit = vi.fn()
    const rendered = renderUi(
      <LockModal mode="lock" noteId={noteId} onClose={vi.fn()} onSubmit={onSubmit} />,
    )
    cleanupTasks.push(rendered.cleanup)

    const password = rendered.container.querySelector<HTMLInputElement>('#sn-lock-password')
    const confirmation = rendered.container.querySelector<HTMLInputElement>(
      '#sn-lock-password-confirmation',
    )
    const submit = rendered.container.querySelector<HTMLButtonElement>('button[type="submit"]')
    const reveal = Array.from(rendered.container.querySelectorAll('button'))
      .find((button) => button.textContent === 'Show')

    expect(password).not.toBeNull()
    expect(confirmation).not.toBeNull()
    expect(submit?.disabled).toBe(true)

    act(() => {
      if (password) setInputValue(password, 'correct-horse')
      if (confirmation) setInputValue(confirmation, 'wrong-horse')
    })
    expect(rendered.container.textContent).toContain('Passwords do not match')
    expect(submit?.disabled).toBe(true)

    act(() => reveal?.click())
    expect(password?.type).toBe('text')
    expect(confirmation?.type).toBe('text')

    act(() => {
      if (confirmation) setInputValue(confirmation, 'correct-horse')
    })
    expect(submit?.disabled).toBe(false)
    act(() => submit?.click())
    expect(onSubmit).toHaveBeenCalledWith({ masterPassword: 'correct-horse' })
  })
})
