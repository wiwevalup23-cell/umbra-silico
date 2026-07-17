import { readFileSync } from 'node:fs'
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  deviceIdSchema,
  folderIdSchema,
  noteIdSchema,
  userIdSchema,
  type FolderTreeNode,
  type NoteListItem,
} from '@/shared'
import {
  FolderTree,
  MoveToFolderDialog,
  QuickSwitcher,
  TemplatePicker,
} from '@/ui/components/notes'
import { PromptDialog } from '@/ui/components/silicon'
import { noteTemplates } from '@/shared/note-templates'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const cleanupTasks: Array<() => void> = []
const now = '2026-07-16T12:00:00.000Z'
const folderId = folderIdSchema.parse('folder_p1b')
const noteId = noteIdSchema.parse('note_p1b')
const folders: FolderTreeNode[] = [{
  children: [],
  folder: {
    createdAt: now,
    deletedAt: null,
    deviceId: deviceIdSchema.parse('device_p1b'),
    id: folderId,
    localRevision: 1,
    name: 'Research',
    parentFolderId: null,
    sortIndex: 0,
    syncStatus: 'dirty',
    updatedAt: now,
    userId: userIdSchema.parse('user_p1b'),
  },
  noteCount: 1,
}]
const notes: NoteListItem[] = [{
  id: noteId,
  isLocked: false,
  parentFolderId: null,
  preview: 'Keyboard research',
  syncStatus: 'dirty',
  title: 'Field note',
  updatedAt: now,
}]

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

describe('P1-B navigation and folder workflows', () => {
  it('searches actions and executes the active quick-switcher result with Enter', () => {
    const onOpenSettings = vi.fn()
    const rendered = renderUi(
      <QuickSwitcher
        notes={[]}
        onClose={vi.fn()}
        onCreateBlank={vi.fn()}
        onOpenSettings={onOpenSettings}
        onOpenTemplates={vi.fn()}
        onOpenTrash={vi.fn()}
        onSelectNote={vi.fn()}
      />,
    )
    cleanupTasks.push(rendered.cleanup)

    const input = rendered.container.querySelector<HTMLInputElement>('#quick-switcher-search')
    act(() => {
      if (input) setInputValue(input, 'settings')
    })
    expect(rendered.container.textContent).toContain('Settings')
    act(() => {
      input?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
    })
    expect(onOpenSettings).toHaveBeenCalledOnce()
    expect(rendered.container.querySelector('dialog')).not.toBeNull()
    expect(rendered.container.querySelector('button[aria-label="Close quick switcher"]')).not.toBeNull()
  })

  it('moves through notes and actions with Arrow keys', () => {
    const onCreateBlank = vi.fn()
    const rendered = renderUi(
      <QuickSwitcher
        notes={notes}
        onClose={vi.fn()}
        onCreateBlank={onCreateBlank}
        onOpenSettings={vi.fn()}
        onOpenTemplates={vi.fn()}
        onOpenTrash={vi.fn()}
        onSelectNote={vi.fn()}
      />,
    )
    cleanupTasks.push(rendered.cleanup)
    const input = rendered.container.querySelector<HTMLInputElement>('#quick-switcher-search')
    act(() => {
      input?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }))
    })
    act(() => {
      input?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
    })
    expect(onCreateBlank).toHaveBeenCalledOnce()
  })

  it('uses the common dialog foundation for templates', () => {
    const rendered = renderUi(
      <TemplatePicker onClose={vi.fn()} onSelect={vi.fn()} templates={noteTemplates} />,
    )
    cleanupTasks.push(rendered.cleanup)
    expect(rendered.container.querySelector('dialog.sn-modal--command')).not.toBeNull()
    expect(rendered.container.querySelectorAll('.sn-template-card').length).toBe(noteTemplates.length)
  })

  it('creates names through the product prompt dialog', () => {
    const onSubmit = vi.fn()
    const rendered = renderUi(
      <PromptDialog
        description="Create a local folder."
        initialValue="New folder"
        label="Folder name"
        onCancel={vi.fn()}
        onSubmit={onSubmit}
        submitLabel="Create folder"
        title="Create folder"
      />,
    )
    cleanupTasks.push(rendered.cleanup)
    const input = rendered.container.querySelector<HTMLInputElement>('input')
    act(() => {
      if (input) setInputValue(input, 'Projects')
      rendered.container.querySelector('form')?.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
    })
    expect(onSubmit).toHaveBeenCalledWith('Projects')
  })

  it('offers explicit folder actions and a touch-safe move destination', () => {
    const onRenameFolder = vi.fn()
    const renderedTree = renderUi(
      <FolderTree
        activeFolderId={null}
        nodes={folders}
        onCreateFolder={vi.fn()}
        onDeleteFolder={vi.fn()}
        onMoveNoteToFolder={vi.fn()}
        onRenameFolder={onRenameFolder}
        onSelectFolder={vi.fn()}
      />,
    )
    cleanupTasks.push(renderedTree.cleanup)
    expect(renderedTree.container.querySelector('button[aria-label="Collapse folder"]')).toBeNull()
    const folderList = renderedTree.container.querySelector<HTMLUListElement>(
      '.sn-folder-tree__list',
    )
    const folderToggle = renderedTree.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Collapse folders"]',
    )
    expect(folderToggle?.getAttribute('aria-expanded')).toBe('true')
    expect(folderList?.hidden).toBe(false)
    act(() => folderToggle?.click())
    expect(folderList?.hidden).toBe(true)
    expect(renderedTree.container.querySelector('button[aria-label="Expand folders"]'))
      .not.toBeNull()
    act(() => renderedTree.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Expand folders"]',
    )?.click())
    act(() => renderedTree.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Actions for Research"]',
    )?.click())
    const rename = Array.from(renderedTree.container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Rename'))
    act(() => rename?.click())
    expect(onRenameFolder).toHaveBeenCalledWith(folderId, 'Research')

    const onMove = vi.fn()
    const renderedMove = renderUi(
      <MoveToFolderDialog
        currentFolderId={null}
        folders={folders}
        noteTitle="Field note"
        onCancel={vi.fn()}
        onMove={onMove}
      />,
    )
    cleanupTasks.push(renderedMove.cleanup)
    const research = Array.from(renderedMove.container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Research'))
    act(() => research?.click())
    expect(onMove).toHaveBeenCalledWith(folderId)
  })

  it('contains no browser folder dialogs and keeps Save and Lock geometry equal', () => {
    const appSource = readFileSync(`${process.cwd()}/src/app/App.tsx`, 'utf8')
    const css = readFileSync(
      `${process.cwd()}/src/ui/styles/silicon-nostalgia.css`,
      'utf8',
    )
    expect(appSource).not.toContain('window.prompt')
    expect(appSource).not.toContain('window.confirm')
    expect(appSource).toContain('aria-label="Open home"')
    expect(appSource).toContain('setIsHomeView(true)')
    expect(appSource).toContain("isHomeView || libraryMode === 'trash'")
    expect(css).toContain('font-family: "SN Cormorant Garamond"')
    expect(css).toContain('CormorantGaramond-Variable.woff2')
    expect(css).toContain('--sn-garamond-weight: 300')
    expect(css).toContain('.sn-editor-actions .sn-icon-button {')
    expect(css).toContain('.sn-editor-actions .sn-icon-button svg {')
  })
})
