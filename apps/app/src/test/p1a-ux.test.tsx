import { readFileSync } from 'node:fs'
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { backgroundImageOptions } from '@/shared/backgrounds'
import { en } from '@/shared/i18n/en'
import {
  deviceIdSchema,
  folderIdSchema,
  notePropertiesSchema,
  userIdSchema,
} from '@/shared/contracts'
import { FolderTree, StatusPicker } from '@/ui/components/notes'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const cleanupTasks: Array<() => void> = []

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
  window.localStorage.removeItem('umbra-silico-custom-statuses')
  while (cleanupTasks.length) cleanupTasks.pop()?.()
})

describe('P1-A visual and interaction contract', () => {
  it('uses descriptive empty-screen background names', () => {
    const labels = backgroundImageOptions.map((option) => option.label)
    expect(labels[0]).toBe('None · clean grid')
    expect(labels).toContain('Pressed botanicals')
    expect(labels).toContain('Warped checker')
    expect(labels.every((label) => !/^Fon \d+$/i.test(label))).toBe(true)
  })

  it('supports arrow keys, Enter and selection state in the status picker', () => {
    const onChange = vi.fn()
    const rendered = renderUi(
      <StatusPicker onChange={onChange} value="none" />,
    )
    cleanupTasks.push(rendered.cleanup)

    const trigger = rendered.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Page status"]',
    )
    act(() => {
      trigger?.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        key: 'ArrowDown',
      }))
    })

    const listbox = rendered.container.querySelector<HTMLElement>('[role="listbox"]')
    expect(listbox).not.toBeNull()
    expect(listbox?.getAttribute('aria-activedescendant')).toContain('idea')

    act(() => {
      listbox?.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        key: 'ArrowDown',
      }))
    })
    act(() => {
      listbox?.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        key: 'Enter',
      }))
    })
    expect(onChange).toHaveBeenCalledWith('active')
  })

  it('creates a named status with a selected retro symbol', () => {
    const onChange = vi.fn()
    const rendered = renderUi(
      <StatusPicker onChange={onChange} value="none" />,
    )
    cleanupTasks.push(rendered.cleanup)

    act(() => rendered.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Page status"]',
    )?.click())
    act(() => Array.from(rendered.container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Create status'))?.click())

    const input = rendered.container.querySelector<HTMLInputElement>(
      'input[placeholder="e.g. Waiting"]',
    )
    act(() => {
      setInputValue(input!, 'Waiting on signal')
      rendered.container.querySelector<HTMLButtonElement>('button[aria-label="Important"]')?.click()
    })
    expect(rendered.container.querySelector('button[aria-label="Important"] svg')).not.toBeNull()
    act(() => {
      rendered.container.querySelector('form')?.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
    })

    expect(onChange).toHaveBeenCalledWith('custom:important:Waiting%20on%20signal')
    expect(notePropertiesSchema.safeParse({
      status: onChange.mock.calls[0]?.[0],
      tags: [],
    }).success).toBe(true)
  })

  it('names the root scope All notes and separates its create action', () => {
    const rendered = renderUi(
      <FolderTree
        activeFolderId={null}
        nodes={[]}
        onCreateFolder={vi.fn()}
        onDeleteFolder={vi.fn()}
        onMoveNoteToFolder={vi.fn()}
        onRenameFolder={vi.fn()}
        onSelectFolder={vi.fn()}
      />,
    )
    cleanupTasks.push(rendered.cleanup)

    expect(rendered.container.textContent).toContain('All notes')
    expect(rendered.container.textContent).not.toContain('Root')
    expect(rendered.container.querySelector('button[aria-label="New root folder"]')).not.toBeNull()
    const folderTreeSource = readFileSync(
      `${process.cwd()}/src/ui/components/notes/FolderTree.tsx`,
      'utf8',
    )
    expect(folderTreeSource).toContain('<UiIcon name="library" />')
  })

  it('drops a dragged note onto the intended folder with move feedback', () => {
    const onMoveNoteToFolder = vi.fn()
    const rendered = renderUi(
      <FolderTree
        activeFolderId={null}
        nodes={[{
          folder: {
            id: folderIdSchema.parse('folder_kraslab'),
            userId: userIdSchema.parse('user_local'),
            name: 'KRASLAB',
            parentFolderId: null,
            sortIndex: 0,
            createdAt: '2026-07-18T00:00:00.000Z',
            updatedAt: '2026-07-18T00:00:00.000Z',
            deletedAt: null,
            localRevision: 1,
            syncStatus: 'synced',
            deviceId: deviceIdSchema.parse('device_local'),
          },
          children: [],
          noteCount: 0,
        }]}
        onCreateFolder={vi.fn()}
        onDeleteFolder={vi.fn()}
        onMoveNoteToFolder={onMoveNoteToFolder}
        onRenameFolder={vi.fn()}
        onSelectFolder={vi.fn()}
      />,
    )
    cleanupTasks.push(rendered.cleanup)
    const row = rendered.container.querySelector<HTMLElement>('.sn-folder-tree__row')
    const dataTransfer = {
      dropEffect: 'none',
      getData: vi.fn(() => 'note_dragged'),
    }

    act(() => {
      const dragOver = new Event('dragover', { bubbles: true, cancelable: true })
      Object.defineProperty(dragOver, 'dataTransfer', { value: dataTransfer })
      row?.dispatchEvent(dragOver)
    })
    expect(row?.dataset.dropTarget).toBe('true')
    expect(dataTransfer.dropEffect).toBe('move')

    act(() => {
      const drop = new Event('drop', { bubbles: true, cancelable: true })
      Object.defineProperty(drop, 'dataTransfer', { value: dataTransfer })
      row?.dispatchEvent(drop)
    })
    expect(onMoveNoteToFolder).toHaveBeenCalledOnce()
    expect(onMoveNoteToFolder).toHaveBeenCalledWith('note_dragged', 'folder_kraslab')
    expect(row?.dataset.dropTarget).toBe('false')
  })

  it('uses the selected workspace background behind both player and editor paper', () => {
    const css = readFileSync(
      `${process.cwd()}/src/ui/styles/silicon-nostalgia.css`,
      'utf8',
    )
    const settingsSource = readFileSync(
      `${process.cwd()}/src/ui/components/silicon/SettingsModal.tsx`,
      'utf8',
    )
    const editorPanelRule = css.match(/\.sn-editor-panel \{[\s\S]*?\n\}/)?.[0] ?? ''

    expect(editorPanelRule).toContain('var(--sn-user-background-image)')
    expect(editorPanelRule).toContain('var(--sn-background-wash)')
    // The copy itself now lives in the dictionary, so the dialog is checked
    // for the keys and the wording is checked where it is written.
    expect(settingsSource).toContain("t('settings.background')")
    expect(settingsSource).toContain("t('settings.backgroundHint')")
    expect(en['settings.backgroundHint']).toContain('player')
    expect(en['settings.backgroundHint']).toContain('editor paper')
  })

  it('keeps block actions touch-visible and collapses mobile formatting into More', () => {
    const css = readFileSync(
      `${process.cwd()}/src/ui/styles/silicon-nostalgia.css`,
      'utf8',
    )
    expect(css).toContain('.sn-block-handle__button--grip')
    expect(css).toContain('width: 44px;')
    expect(css).toContain('.sn-editor-tool[aria-label="Ordered list"]')
    expect(css).toContain('.sn-editor-tools-menu')
    expect(css).toContain('bottom: calc(var(--sn-tabbar-height)')
  })

  it('keeps the paper physical and applies release-surface overrides', () => {
    const css = readFileSync(
      `${process.cwd()}/src/ui/styles/silicon-nostalgia.css`,
      'utf8',
    )
    const blockHandle = readFileSync(
      `${process.cwd()}/src/ui/components/notes/BlockHandle.tsx`,
      'utf8',
    )
    const logo = readFileSync(
      `${process.cwd()}/public/assets/umbra-silico-eclipse-compass-u.svg`,
      'utf8',
    )

    expect(css).toContain('overflow-y: auto !important;')
    expect(css).toContain('overflow: visible !important;')
    expect(css).toContain('margin: 20px !important;')
    expect(css).toContain('min-height: calc(100% - 40px) !important;')
    expect(css).toContain('min-height: 520px !important;')
    expect(css).toContain('margin-top: 24px !important;')
    expect(css).toContain('width: calc(100% - 60px) !important;')
    expect(css).toContain('max-width: none !important;')
    expect(css).toContain('margin: 0 30px !important;')
    expect(css).toContain('padding: 0 40px !important;')
    expect(css).toContain('right: 12px !important;')
    expect(css).toContain('input[type="checkbox"]:checked')
    expect(css).toContain('details > :not(summary)')
    expect(css).toContain('border-left: none !important;')
    expect(css).toContain('border: 1px solid rgba(0, 0, 0, 0.08) !important;')
    expect(css).toContain('background: var(--sn-bevel-bg) !important;')
    expect(css).toContain('color: var(--sn-ink-soft) !important;')
    expect(css).toContain('background-color: rgba(210, 180, 180, 0.15) !important;')
    expect(blockHandle).toContain('lineMidpoint - frameRect.top')
    expect(blockHandle).toContain("scrollContainer?.addEventListener('scroll'")
    expect(logo).toContain('translate(142.8,380.5)')
    expect(logo).toContain('<polygon id="corona"')
    expect(logo).toContain('<use href="#corona" fill="#141414"')
    expect(logo).not.toContain('<circle cx="240" cy="250" r="195"')
    expect(logo).not.toContain('translate(142.8,387.29)')
  })
})
