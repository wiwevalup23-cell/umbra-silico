import { Editor, type JSONContent } from '@tiptap/core'
import { Mathematics } from '@tiptap/extension-mathematics'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import { parseNoteDocument, type DocumentNode } from '@/shared/contracts'
import { NoteTextStyleExtensions } from '@/ui/editor'

const editors: Editor[] = []

function createEditor(content?: JSONContent): Editor {
  const editor = new Editor({
    content: content ?? {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Styled equation' }],
        },
      ],
    },
    extensions: [
      StarterKit,
      ...NoteTextStyleExtensions,
      Mathematics.configure({ katexOptions: { throwOnError: false } }),
    ],
  })

  editors.push(editor)
  return editor
}

afterEach(() => {
  while (editors.length > 0) {
    editors.pop()?.destroy()
  }
})

describe('rich text and mathematics', () => {
  it('persists font family, font size and multicolor marker in note JSON', () => {
    const editor = createEditor()

    editor
      .chain()
      .setTextSelection({ from: 1, to: 7 })
      .setFontFamily('Lora Variable')
      .setFontSize('24px')
      .setHighlight({ color: '#b9d8e8' })
      .run()

    const document = parseNoteDocument({
      schemaVersion: 1,
      editor: 'tiptap',
      content: editor.getJSON(),
    })
    const paragraph = document.content.content?.[0] as DocumentNode | undefined
    const textNode = paragraph?.content?.[0]

    expect(textNode).toMatchObject({
      marks: expect.arrayContaining([
        { attrs: { fontFamily: 'Lora Variable', fontSize: '24px' }, type: 'textStyle' },
        { attrs: { color: '#b9d8e8' }, type: 'highlight' },
      ]),
      text: 'Styled',
      type: 'text',
    })
  })

  it('stores inline and block equations as rendered KaTeX nodes', () => {
    const editor = createEditor({ type: 'doc', content: [{ type: 'paragraph' }] })

    editor.chain().focus('start').insertInlineMath({ latex: 'E = mc^2' }).run()
    editor.chain().focus('end').insertBlockMath({ latex: String.raw`\int_0^1 x^2 dx` }).run()

    const json = editor.getJSON()
    const serialized = JSON.stringify(json)

    expect(serialized).toContain('inlineMath')
    expect(serialized).toContain('blockMath')
    expect(serialized).toContain('E = mc^2')
    expect(editor.view.dom.querySelector('.katex')).not.toBeNull()
    expect(() =>
      parseNoteDocument({ schemaVersion: 1, editor: 'tiptap', content: json }),
    ).not.toThrow()
  })
})
