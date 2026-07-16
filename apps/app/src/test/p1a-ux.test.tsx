import { readFileSync } from 'node:fs'
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { backgroundImageOptions } from '@/shared/backgrounds'
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

afterEach(() => {
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
})
