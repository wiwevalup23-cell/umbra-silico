import { Editor, type JSONContent } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import {
  Callout,
  TaskListExtensions,
  ToggleExtensions,
  turnInto,
} from '@/ui/editor'
import { parseNoteDocument } from '@/shared/contracts'

const editors: Editor[] = []

function createEditor(content: JSONContent = paragraph('Block body')): Editor {
  const editor = new Editor({
    content: {
      type: 'doc',
      content: [content],
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

function paragraph(text: string): JSONContent {
  return {
    type: 'paragraph',
    content: [{ type: 'text', text }],
  }
}

function findNode(
  node: JSONContent,
  predicate: (candidate: JSONContent) => boolean,
): JSONContent | null {
  if (predicate(node)) {
    return node
  }

  for (const child of node.content ?? []) {
    const match = findNode(child, predicate)

    if (match) {
      return match
    }
  }

  return null
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

describe('editor block extensions', () => {
  it('creates divider, code, task, toggle and callout documents that pass contracts', () => {
    const cases: Array<{
      create(editor: Editor): void
      type: string
    }> = [
      {
        create(editor) {
          editor.chain().focus().setHorizontalRule().run()
        },
        type: 'horizontalRule',
      },
      {
        create(editor) {
          turnInto(editor, 'codeBlock')
        },
        type: 'codeBlock',
      },
      {
        create(editor) {
          turnInto(editor, 'taskList')
        },
        type: 'taskList',
      },
      {
        create(editor) {
          turnInto(editor, 'toggle')
        },
        type: 'details',
      },
      {
        create(editor) {
          turnInto(editor, 'callout')
        },
        type: 'callout',
      },
    ]

    for (const testCase of cases) {
      const editor = createEditor()
      testCase.create(editor)
      const document = parseEditorDocument(editor)

      expect(findNode(document.content, (node) => node.type === testCase.type)).not.toBeNull()
    }
  })

  it('preserves checked task item state as JSON boolean', () => {
    const editor = createEditor()

    turnInto(editor, 'taskList')
    editor.commands.updateAttributes('taskItem', { checked: true })

    const document = parseEditorDocument(editor)
    const taskItem = findNode(document.content, (node) => node.type === 'taskItem')

    expect(taskItem?.attrs).toMatchObject({ checked: true })
  })
})
