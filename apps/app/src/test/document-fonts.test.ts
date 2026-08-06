import { describe, expect, it } from 'vitest'
import type { NoteDocument } from '@/shared/contracts/document'
import { migrateRetiredDocumentFonts, retiredDocumentFonts } from '@/shared/document-fonts'
import { editorFontOptions } from '@/ui/editor/rich-text'

function noteDocument(content: NoteDocument['content']['content']): NoteDocument {
  return { schemaVersion: 1, editor: 'tiptap', content: { type: 'doc', content } }
}

function styledText(text: string, fontFamily: string) {
  return {
    type: 'text' as const,
    text,
    marks: [{ type: 'textStyle', attrs: { fontFamily } }],
  }
}

describe('retired document fonts', () => {
  it('repoints every retired face at one the palette still offers', () => {
    const offered = new Set(editorFontOptions.map((option) => option.value))

    for (const [retired, replacement] of Object.entries(retiredDocumentFonts)) {
      expect(offered.has(retired)).toBe(false)
      // '' is the "no explicit face" case and is always available.
      expect(offered.has(replacement)).toBe(true)
    }
  })

  it('rewrites a retired face to its replacement', () => {
    const document = noteDocument([
      { type: 'paragraph', content: [styledText('Handwritten note', 'Caveat Variable')] },
    ])

    const result = migrateRetiredDocumentFonts(document)

    expect(result.changed).toBe(true)
    const mark = (result.document.content.content?.[0] as { content?: Array<{ marks?: Array<{ attrs?: Record<string, unknown> }> }> })
      .content?.[0].marks?.[0]
    expect(mark?.attrs?.fontFamily).toBe('SN EB Garamond')
  })

  it('drops the attribute entirely when the replacement is the document default', () => {
    const document = noteDocument([
      { type: 'paragraph', content: [styledText('UI-face body text', 'Inter Variable')] },
    ])

    const result = migrateRetiredDocumentFonts(document)

    expect(result.changed).toBe(true)
    const mark = (result.document.content.content?.[0] as { content?: Array<{ marks?: Array<{ attrs?: Record<string, unknown> }> }> })
      .content?.[0].marks?.[0]
    // An empty family would serialize to a broken `font-family: ` declaration.
    expect(mark?.attrs && 'fontFamily' in mark.attrs).toBe(false)
  })

  it('reaches faces nested inside lists and other containers', () => {
    const document = noteDocument([
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [styledText('Slab item', 'Roboto Slab Variable')],
              },
            ],
          },
        ],
      },
    ])

    expect(JSON.stringify(migrateRetiredDocumentFonts(document).document)).toContain(
      'Lora Variable',
    )
  })

  it('leaves surviving faces and unstyled text untouched', () => {
    const document = noteDocument([
      { type: 'paragraph', content: [styledText('Kept as chosen', 'Lora Variable')] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Plain body text' }] },
    ])

    const result = migrateRetiredDocumentFonts(document)

    expect(result.changed).toBe(false)
    // Unchanged documents are returned by reference so callers can skip the write.
    expect(result.document).toBe(document)
  })
})
