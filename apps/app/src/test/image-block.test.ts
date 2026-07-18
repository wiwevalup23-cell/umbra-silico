import { Editor, type JSONContent } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import {
  collectImageIdsFromDocument,
  parseNoteDocument,
} from '@/shared/contracts'
import {
  Callout,
  ImageBlock,
  normalizeImageAlign,
  normalizeImageWidthPct,
} from '@/ui/editor'

const editors: Editor[] = []

function createEditor(content: JSONContent[]): Editor {
  const editor = new Editor({
    content: { type: 'doc', content },
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Callout,
      ImageBlock,
    ],
  })

  editors.push(editor)
  return editor
}

function paragraph(text: string): JSONContent {
  return { type: 'paragraph', content: [{ type: 'text', text }] }
}

function imageBlock(imageId: string): JSONContent {
  return {
    type: 'imageBlock',
    attrs: {
      imageId,
      caption: 'Sunset',
      align: 'right',
      widthPct: 60,
      naturalWidth: 4000,
      naturalHeight: 3000,
    },
  }
}

afterEach(() => {
  while (editors.length > 0) {
    editors.pop()?.destroy()
  }
})

describe('image block extension', () => {
  it('round-trips image attrs through the note document contract', () => {
    const editor = createEditor([paragraph('Intro'), imageBlock('image_rt')])

    const document = parseNoteDocument({
      schemaVersion: 1,
      editor: 'tiptap',
      content: editor.getJSON(),
    })

    const node = document.content.content?.find(
      (child) => child.type === 'imageBlock',
    )
    const attrs = node && 'attrs' in node ? node.attrs : undefined

    expect(attrs).toMatchObject({
      imageId: 'image_rt',
      caption: 'Sunset',
      align: 'right',
      widthPct: 60,
      naturalWidth: 4000,
      naturalHeight: 3000,
    })
  })

  it('inserts image blocks via the commands', () => {
    const editor = createEditor([paragraph('Alpha'), paragraph('Beta')])

    editor.commands.insertImageBlockAt(editor.state.doc.content.size, {
      imageId: 'image_cmd',
    })

    const json = editor.getJSON()
    // StarterKit's trailing-node behavior keeps an empty paragraph after the
    // atom so typing can continue below the image.
    const inserted = json.content?.find((node) => node.type === 'imageBlock')

    expect(inserted?.attrs).toMatchObject({
      imageId: 'image_cmd',
      align: 'center',
      widthPct: 100,
    })
  })

  it('collects image ids from top-level and nested blocks, ignoring junk', () => {
    const editor = createEditor([
      imageBlock('image_top'),
      {
        type: 'callout',
        attrs: { emoji: '💡', tone: 'info' },
        content: [paragraph('Inside'), imageBlock('image_nested')],
      },
      { type: 'imageBlock', attrs: { imageId: '' } },
      imageBlock('image_top'),
    ])

    const document = parseNoteDocument({
      schemaVersion: 1,
      editor: 'tiptap',
      content: editor.getJSON(),
    })

    expect(collectImageIdsFromDocument(document).sort()).toEqual([
      'image_nested',
      'image_top',
    ])
  })

  it('normalizes align and width attributes', () => {
    expect(normalizeImageAlign('right')).toBe('right')
    expect(normalizeImageAlign('diagonal')).toBe('center')
    expect(normalizeImageWidthPct(140)).toBe(100)
    expect(normalizeImageWidthPct(3)).toBe(10)
    expect(normalizeImageWidthPct('55')).toBe(55)
    expect(normalizeImageWidthPct('not-a-number')).toBe(100)
  })
})
