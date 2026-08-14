import { Editor, type JSONContent } from '@tiptap/core'
import { redoDepth, undoDepth } from '@tiptap/pm/history'
import { TextSelection } from '@tiptap/pm/state'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNoteEditorExtensions } from '@/ui/editor/extensions'
import { EditorToolbar } from '@/ui/editor/toolbar/EditorToolbar'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const cleanupTasks: Array<() => void> = []

afterEach(() => {
  while (cleanupTasks.length > 0) {
    cleanupTasks.pop()?.()
  }
})

function documentWithTable(): JSONContent {
  return {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Before the table' }] },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'H1' }] }] },
              { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'H2' }] }] },
            ],
          },
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] },
              { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] },
            ],
          },
        ],
      },
    ],
  }
}

function mountToolbar(content: JSONContent = documentWithTable()) {
  const container = document.createElement('div')

  document.body.append(container)

  const editor = new Editor({
    content,
    extensions: createNoteEditorExtensions({ onEditMath: () => {} }),
  })
  const root = createRoot(container)

  act(() => {
    root.render(<EditorToolbar editor={editor} onOpenMath={() => {}} />)
  })

  cleanupTasks.push(() => {
    act(() => {
      root.unmount()
    })
    editor.destroy()
    container.remove()
  })

  return { container, editor }
}

function findTablePosition(editor: Editor): number {
  let tablePosition = -1

  editor.state.doc.descendants((node, position) => {
    if (node.type.name === 'table' && tablePosition === -1) {
      tablePosition = position
    }

    return true
  })

  return tablePosition
}

function openTablePanel(container: HTMLElement) {
  const button = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Table"]',
  )

  expect(button).not.toBeNull()

  act(() => {
    button?.click()
  })
}

/** The table panel is portalled to the body, not into the toolbar. */
function tablePanelButton(label: string): HTMLButtonElement | null {
  return document.body.querySelector<HTMLButtonElement>(
    `.sn-editor-tools-menu button[aria-label="${label}"]`,
  )
}

describe('what the toolbar asks the editor on every transaction', () => {
  it('does not dry-run the table commands while the table panel is shut', () => {
    const { editor } = mountToolbar()
    const can = vi.spyOn(editor, 'can')

    act(() => {
      editor.commands.setTextSelection(4)
    })

    // `can()` builds a chainable state and runs the whole command to answer,
    // which is why it is worth not asking. Nothing outside the table panel
    // reads those seven answers.
    expect(can).not.toHaveBeenCalled()
  })

  it('asks once the panel is open, because the answers are on screen', () => {
    const { container, editor } = mountToolbar()

    openTablePanel(container)

    const can = vi.spyOn(editor, 'can')

    act(() => {
      editor.commands.setTextSelection(findTablePosition(editor) + 5)
    })

    expect(can).toHaveBeenCalled()
  })

  it('enables the table controls for a caret inside a cell', () => {
    const { container, editor } = mountToolbar()

    act(() => {
      editor.commands.setTextSelection(findTablePosition(editor) + 5)
    })
    openTablePanel(container)

    expect(tablePanelButton('Row above')?.disabled).toBe(false)
    expect(tablePanelButton('Delete table')?.disabled).toBe(false)
  })

  it('leaves them disabled for a caret outside any table', () => {
    const { container, editor } = mountToolbar()

    act(() => {
      editor.commands.setTextSelection(2)
    })
    openTablePanel(container)

    expect(tablePanelButton('Row above')?.disabled).toBe(true)
    expect(tablePanelButton('Delete table')?.disabled).toBe(true)
  })

  it('still enables them for a selection dragged from outside into the table', () => {
    const { container, editor } = mountToolbar()
    const tablePosition = findTablePosition(editor)

    act(() => {
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, 1, tablePosition + 5),
        ),
      )
    })
    openTablePanel(container)

    // This is the case that rules out the cheaper-looking gate: here
    // `isActive('table')` is false, yet the commands themselves apply. Gating
    // the probes on it would have greyed out controls that work.
    expect(editor.isActive('table')).toBe(false)
    expect(editor.can().addRowAfter()).toBe(true)
    expect(tablePanelButton('Row above')?.disabled).toBe(false)
  })
})

describe('the toolbar undo and redo state', () => {
  it('matches what the commands themselves would report', () => {
    const editor = new Editor({
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Start' }] }],
      },
      extensions: createNoteEditorExtensions({ onEditMath: () => {} }),
    })

    cleanupTasks.push(() => editor.destroy())

    function expectAgreement() {
      expect(undoDepth(editor.state) > 0).toBe(editor.can().undo())
      expect(redoDepth(editor.state) > 0).toBe(editor.can().redo())
    }

    // A fresh editor: nothing to undo, nothing to redo.
    expectAgreement()
    expect(undoDepth(editor.state) > 0).toBe(false)

    editor.commands.insertContent(' and more')
    expectAgreement()
    expect(undoDepth(editor.state) > 0).toBe(true)

    editor.commands.undo()
    expectAgreement()
    expect(redoDepth(editor.state) > 0).toBe(true)

    editor.commands.redo()
    expectAgreement()

    // Back to the bottom of the stack.
    editor.commands.undo()
    expectAgreement()
    expect(undoDepth(editor.state) > 0).toBe(false)
  })
})
