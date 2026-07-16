import { Editor, type JSONContent } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import {
  Callout,
  deleteCurrentBlock,
  duplicateCurrentBlock,
  moveBlockToPosition,
  moveCurrentBlock,
  TaskListExtensions,
  ToggleExtensions,
} from '@/ui/editor'
import { parseNoteDocument } from '@/shared/contracts'

const editors: Editor[] = []

function paragraph(text: string): JSONContent {
  return {
    type: 'paragraph',
    content: [{ type: 'text', text }],
  }
}

function createEditor(blocks: JSONContent[] = [
  paragraph('Alpha'),
  paragraph('Beta'),
  paragraph('Gamma'),
]): Editor {
  const editor = new Editor({
    content: {
      type: 'doc',
      content: blocks,
    },
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      ...TaskListExtensions,
      ...ToggleExtensions,
      Callout,
    ],
  })

  editors.push(editor)
  return editor
}

function blockTexts(editor: Editor): string[] {
  function firstText(node: JSONContent): string {
    if (typeof node.text === 'string') {
      return node.text
    }

    for (const child of node.content ?? []) {
      const text = firstText(child)

      if (text) {
        return text
      }
    }

    return ''
  }

  return editor.getJSON().content?.map(firstText) ?? []
}

function parseEditorDocument(editor: Editor) {
  return parseNoteDocument({
    schemaVersion: 1,
    editor: 'tiptap',
    content: editor.getJSON(),
  })
}

afterEach(() => {
  while (editors.length > 0) {
    editors.pop()?.destroy()
  }
})

describe('block handle editor actions', () => {
  it('duplicates the selected top-level block', () => {
    const editor = createEditor()

    editor.commands.setTextSelection(2)
    expect(duplicateCurrentBlock(editor)).toBe(true)

    expect(blockTexts(editor)).toEqual(['Alpha', 'Alpha', 'Beta', 'Gamma'])
    expect(parseEditorDocument(editor).content.type).toBe('doc')
  })

  it('deletes the selected top-level block', () => {
    const editor = createEditor()

    editor.commands.setTextSelection(9)
    expect(deleteCurrentBlock(editor)).toBe(true)

    expect(blockTexts(editor)).toEqual(['Alpha', 'Gamma'])
    expect(parseEditorDocument(editor).content.type).toBe('doc')
  })

  it('moves the selected block up and down', () => {
    const editor = createEditor()

    editor.commands.setTextSelection(9)
    expect(moveCurrentBlock(editor, 'up')).toBe(true)
    expect(blockTexts(editor)).toEqual(['Beta', 'Alpha', 'Gamma'])

    expect(moveCurrentBlock(editor, 'down')).toBe(true)
    expect(blockTexts(editor)).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(parseEditorDocument(editor).content.type).toBe('doc')
  })

  it('moves a dragged block to a target position', () => {
    const editor = createEditor()

    expect(moveBlockToPosition(editor, 0, 14, 'after')).toBe(true)

    expect(blockTexts(editor)).toEqual(['Beta', 'Gamma', 'Alpha'])
    expect(parseEditorDocument(editor).content.type).toBe('doc')
  })
})
