import { describe, expect, it } from 'vitest'
import type { NoteDocument } from '@/shared/contracts/document'
import { migrateRetiredDocumentFonts, retiredDocumentFonts } from '@/shared/document-fonts'
import { documentFontFamilies } from '@/shared/document-styles'
import { editorFontOptions } from '@/ui/document/rich-text'

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

/** Attrs of the first mark on the first inline child of the first block. */
function firstMarkAttrs(document: NoteDocument): Record<string, unknown> | undefined {
  type Inline = { marks?: Array<{ attrs?: Record<string, unknown> }> }
  const block = document.content.content?.[0] as { content?: Inline[] } | undefined
  return block?.content?.[0]?.marks?.[0]?.attrs
}

describe('retired document fonts', () => {
  it('repoints every retired face at one the palette still offers', () => {
    const allowed = new Set<string>(documentFontFamilies)

    for (const [retired, replacement] of Object.entries(retiredDocumentFonts)) {
      expect(allowed.has(retired)).toBe(false)
      // '' is the "no explicit face" case and is always available. The rest is
      // a compile-time guarantee now; this keeps the retired side honest.
      expect(replacement === '' || allowed.has(replacement)).toBe(true)
    }
  })

  it('offers exactly the faces the format allows', () => {
    // The picker pairs a label with a value; the format owns the values. A
    // face added to one and not the other would be either unselectable or
    // silently dropped on the next write.
    expect(editorFontOptions.filter((option) => option.value).map((option) => option.value))
      .toEqual([...documentFontFamilies])
  })

  it('rewrites a retired face to its replacement', () => {
    const document = noteDocument([
      { type: 'paragraph', content: [styledText('Handwritten note', 'Caveat Variable')] },
    ])

    const result = migrateRetiredDocumentFonts(document)

    expect(result.changed).toBe(true)
    expect(firstMarkAttrs(result.document)?.fontFamily).toBe('SN EB Garamond')
  })

  it('drops the attribute entirely when the replacement is the document default', () => {
    const document = noteDocument([
      { type: 'paragraph', content: [styledText('UI-face body text', 'Inter Variable')] },
    ])

    const result = migrateRetiredDocumentFonts(document)

    expect(result.changed).toBe(true)
    // An empty family would serialize to a broken `font-family: ` declaration.
    const attrs = firstMarkAttrs(result.document)
    expect(attrs).toBeDefined()
    expect(attrs && 'fontFamily' in attrs).toBe(false)
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
