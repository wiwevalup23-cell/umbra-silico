import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createNoteEditorExtensions } from '@/ui/editor/extensions'
import { readNumber } from '@/ui/editor/extensions/read-number'

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
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'typed' }] }],
    },
    extensions: createNoteEditorExtensions({ onEditMath: () => undefined }),
  })

  editors.push(editor)
  return editor
}

function firstBlockAttrs(editor: Editor): Record<string, unknown> {
  return (editor.getJSON().content?.[0]?.attrs ?? {}) as Record<string, unknown>
}

describe('line height on a paragraph that came in as HTML', () => {
  it('matches a typed paragraph when the source declared none', () => {
    const editor = createEditor()
    const typed = firstBlockAttrs(editor).blockLineHeight

    expect(typed).toBe(1.6)

    // A plain `<p>` off a web page or out of another editor. Reading
    // `element.style.lineHeight` gives `''`, and `''` used to become zero,
    // which clamped up to the tightest rung on the ladder — so pasted text sat
    // visibly cramped beside text typed a line above it.
    editor.commands.setContent('<p>pasted from somewhere</p>')

    expect(firstBlockAttrs(editor).blockLineHeight).toBe(typed)
  })

  it('keeps a line height the source did declare', () => {
    const editor = createEditor()

    editor.commands.setContent('<p style="line-height: 2">spaced out</p>')
    expect(firstBlockAttrs(editor).blockLineHeight).toBe(2)

    // Our own serialization round trip.
    editor.commands.setContent('<p data-block-line-height="1.2">from a note</p>')
    expect(firstBlockAttrs(editor).blockLineHeight).toBe(1.2)
  })

  it('still holds a declared value inside the ladder', () => {
    const editor = createEditor()

    editor.commands.setContent('<p style="line-height: 9">far too airy</p>')
    expect(firstBlockAttrs(editor).blockLineHeight).toBe(3)

    editor.commands.setContent('<p style="line-height: 0.2">far too tight</p>')
    expect(firstBlockAttrs(editor).blockLineHeight).toBe(1)
  })
})

describe('first-line indentation', () => {
  it('defaults to none and persists a bounded pixel value', () => {
    const editor = createEditor()

    expect(firstBlockAttrs(editor).blockFirstLineIndent).toBe(0)

    editor.commands.setBlockFirstLineIndent(24)
    expect(firstBlockAttrs(editor).blockFirstLineIndent).toBe(24)
    expect(editor.getHTML()).toContain('data-block-first-line-indent="24"')
    expect(editor.getHTML()).toContain('text-indent: 24px')

    editor.commands.setBlockFirstLineIndent(999)
    expect(firstBlockAttrs(editor).blockFirstLineIndent).toBe(96)

    editor.commands.setBlockFirstLineIndent(-10)
    expect(firstBlockAttrs(editor).blockFirstLineIndent).toBe(0)
  })

  it('reads indentation from pasted HTML without disturbing line spacing', () => {
    const editor = createEditor()

    editor.commands.setContent(
      '<p style="text-indent: 32px; line-height: 1.8">pasted paragraph</p>',
    )

    expect(firstBlockAttrs(editor)).toMatchObject({
      blockFirstLineIndent: 32,
      blockLineHeight: 1.8,
    })
  })
})

describe('reading a number that may not be there', () => {
  it('tells an absent value from a zero', () => {
    // The whole point: every one of these used to read as 0, which is finite,
    // so it passed for a real measurement.
    expect(readNumber('')).toBeNull()
    expect(readNumber('   ')).toBeNull()
    expect(readNumber(null)).toBeNull()
    expect(readNumber(undefined)).toBeNull()

    expect(readNumber(0)).toBe(0)
    expect(readNumber('0')).toBe(0)
  })

  it('rejects what is not a number at all', () => {
    expect(readNumber('normal')).toBeNull()
    expect(readNumber(Number.NaN)).toBeNull()
    expect(readNumber(Number.POSITIVE_INFINITY)).toBeNull()
    expect(readNumber({})).toBeNull()
  })

  it('reads the numbers that are there', () => {
    expect(readNumber('1.6')).toBe(1.6)
    expect(readNumber(' 48 ')).toBe(48)
    expect(readNumber(-3)).toBe(-3)
  })
})
