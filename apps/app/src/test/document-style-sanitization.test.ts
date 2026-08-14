import { Editor, type JSONContent } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import { parseNoteDocument } from '@/shared/contracts'
import {
  editorFontOptions,
  editorHighlightOptions,
  editorTextSizeOptions,
  NoteTextStyleExtensions,
  readDocumentFontFamily,
  readDocumentFontSize,
  readHighlightColor,
} from '@/ui/document/rich-text'

const editors: Editor[] = []

afterEach(() => {
  while (editors.length > 0) {
    editors.pop()?.destroy()
  }
})

function createEditor(content: JSONContent): Editor {
  const editor = new Editor({
    content,
    extensions: [StarterKit, ...NoteTextStyleExtensions],
  })

  editors.push(editor)
  return editor
}

function markAttrs(editor: Editor, markType: string): Record<string, unknown> {
  const paragraph = editor.getJSON().content?.[0]
  const marks = paragraph?.content?.[0]?.marks ?? []

  return marks.find((mark) => mark.type === markType)?.attrs ?? {}
}

function textStyleAttrs(editor: Editor): Record<string, unknown> {
  const { fontFamily, fontSize } = markAttrs(editor, 'textStyle')

  // Absent and null mean the same thing here, and which one TipTap emits
  // depends on whether the other attribute was set.
  return { fontFamily: fontFamily ?? null, fontSize: fontSize ?? null }
}

function styledText(marks: JSONContent['marks']): JSONContent {
  return {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'looks ordinary', marks }] },
    ],
  }
}

describe('style attributes carried by a note document', () => {
  // A note document is not trusted input: `attrs` is free-form JSON, and a
  // document arrives from backups, Telegram imports and sync.
  const hostileFontFamily = 'serif; background: url(https://tracker.example/beacon.png)'

  it('refuses a font family that smuggles a second declaration', () => {
    const document = parseNoteDocument({
      schemaVersion: 1,
      editor: 'tiptap',
      content: styledText([{ type: 'textStyle', attrs: { fontFamily: hostileFontFamily } }]),
    })
    const editor = createEditor(document.content)

    expect(editor.getHTML()).not.toContain('tracker.example')
    expect(editor.getHTML()).not.toContain('url(')
    expect(editor.getText()).toBe('looks ordinary')
  })

  it('refuses a font size and a highlight colour that do the same', () => {
    const editor = createEditor(
      styledText([
        { type: 'textStyle', attrs: { fontSize: '1px; background: url(https://a.example/b)' } },
        { type: 'highlight', attrs: { color: 'red; background-image: url(https://c.example/d)' } },
      ]),
    )

    expect(editor.getHTML()).not.toContain('a.example')
    expect(editor.getHTML()).not.toContain('c.example')
    expect(editor.getHTML()).not.toContain('url(')
  })

  it('does not store a hostile value pasted in as HTML', () => {
    const editor = createEditor({ type: 'doc', content: [{ type: 'paragraph' }] })

    editor.commands.setContent(
      `<p><span style="font-family: ${hostileFontFamily}">pasted</span></p>`,
    )

    expect(JSON.stringify(editor.getJSON())).not.toContain('tracker.example')
  })

  it('keeps every value the palette actually offers', () => {
    for (const { value: fontFamily } of editorFontOptions.filter((o) => o.value)) {
      for (const { value: fontSize } of editorTextSizeOptions.filter((o) => o.value)) {
        const editor = createEditor(
          styledText([{ type: 'textStyle', attrs: { fontFamily, fontSize } }]),
        )

        expect(textStyleAttrs(editor)).toEqual({ fontFamily, fontSize })
      }
    }

    for (const { color } of editorHighlightOptions) {
      const editor = createEditor(styledText([{ type: 'highlight', attrs: { color } }]))

      expect(markAttrs(editor, 'highlight').color).toBe(color)
    }
  })

  it('survives the round trip through stored JSON', () => {
    const fontFamily = editorFontOptions[2].value
    const { color } = editorHighlightOptions[3]
    const editor = createEditor(
      styledText([
        { type: 'textStyle', attrs: { fontFamily } },
        { type: 'highlight', attrs: { color } },
      ]),
    )

    const reopened = createEditor(parseNoteDocument({
      schemaVersion: 1,
      editor: 'tiptap',
      content: editor.getJSON(),
    }).content)

    expect(textStyleAttrs(reopened).fontFamily).toBe(fontFamily)
    expect(markAttrs(reopened, 'highlight').color).toBe(color)
  })

  it('survives the round trip through HTML, which copy and paste uses', () => {
    const fontFamily = editorFontOptions[1].value
    const editor = createEditor(styledText([{ type: 'textStyle', attrs: { fontFamily } }]))

    // The CSSOM quotes a multi-word family the moment it reaches a style
    // property, so what comes back is `"SN EB Garamond"`. Matching the raw
    // spelling would silently drop the face on every paste.
    expect(editor.getHTML()).toContain('&quot;')

    editor.commands.setContent(editor.getHTML())

    expect(textStyleAttrs(editor).fontFamily).toBe(fontFamily)
  })
})

describe('the guards themselves', () => {
  it('accepts only what the palette offers', () => {
    expect(readDocumentFontFamily('Lora Variable')).toBe('Lora Variable')
    expect(readDocumentFontFamily('Comic Sans')).toBeNull()
    expect(readDocumentFontFamily(42)).toBeNull()
    // The empty option means "no explicit face", not a face called "".
    expect(readDocumentFontFamily('')).toBeNull()

    expect(readDocumentFontSize('17px')).toBe('17px')
    expect(readDocumentFontSize('17')).toBeNull()
    expect(readDocumentFontSize('99px')).toBeNull()
  })

  it('accepts any six-digit hex highlight and nothing else', () => {
    expect(readHighlightColor('#f3df84')).toBe('#f3df84')
    expect(readHighlightColor('#ABCDEF')).toBe('#ABCDEF')
    expect(readHighlightColor('#fff')).toBeNull()
    expect(readHighlightColor('rgb(1,2,3)')).toBeNull()
    expect(readHighlightColor('#f3df84; background: url(https://e.example/f)')).toBeNull()
  })
})
