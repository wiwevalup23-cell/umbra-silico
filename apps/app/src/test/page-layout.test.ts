import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createNoteEditorExtensions } from '@/ui/editor/extensions'

const editors: Editor[] = []

afterEach(() => {
  while (editors.length > 0) {
    editors.pop()?.destroy()
  }
})

function createEditor(): Editor {
  const editor = new Editor({
    content: {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    },
    extensions: createNoteEditorExtensions({ onEditMath: () => undefined }),
  })

  editors.push(editor)
  return editor
}

describe('page layout commands', () => {
  it('creates a normal symmetric default', () => {
    expect(createEditor().getJSON().attrs).toMatchObject({
      pageFooterOffset: 88,
      pageHeaderOffset: 56,
      pageLayoutVersion: 3,
      pageSideMargin: 64,
    })
  })

  it('keeps every exact field inside a useful range', () => {
    const editor = createEditor()

    editor.commands.setPageSideMargin(12)
    editor.commands.setPageHeaderOffset(0)
    editor.commands.setPageFooterOffset(999)

    expect(editor.getJSON().attrs).toMatchObject({
      pageFooterOffset: 180,
      pageHeaderOffset: 32,
      pageSideMargin: 48,
    })

    editor.commands.setPageSideMargin(999)
    expect(editor.getJSON().attrs?.pageSideMargin).toBe(96)
  })

  it('applies a preset as one undoable change', () => {
    const editor = createEditor()

    editor.commands.setPageLayout({
      pageFooterOffset: 72,
      pageHeaderOffset: 40,
      pageSideMargin: 48,
    })
    expect(editor.getJSON().attrs).toMatchObject({
      pageFooterOffset: 72,
      pageHeaderOffset: 40,
      pageSideMargin: 48,
    })

    editor.commands.undo()
    expect(editor.getJSON().attrs).toMatchObject({
      pageFooterOffset: 88,
      pageHeaderOffset: 56,
      pageSideMargin: 64,
    })
  })
})
