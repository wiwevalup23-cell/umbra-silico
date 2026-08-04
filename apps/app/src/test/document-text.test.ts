import { describe, expect, it } from 'vitest'
import type { DocumentNode, TextNode } from '@/shared/contracts/document'
import {
  createNotePreview,
  createNoteSearchText,
  deriveTitleFromDocument,
  extractDocumentText,
} from '@/shared/document-text'

function doc(content: DocumentNode[]): DocumentNode {
  return { type: 'doc', content }
}

function noteDocument(content: DocumentNode[]) {
  return { schemaVersion: 1 as const, editor: 'tiptap' as const, content: doc(content) }
}

function paragraph(content: Array<DocumentNode | TextNode>): DocumentNode {
  return { type: 'paragraph', content }
}

function text(value: string, marks?: TextNode['marks']): TextNode {
  return { type: 'text', text: value, ...(marks ? { marks } : {}) }
}

describe('extractDocumentText', () => {
  it('joins adjacent text runs within one block without a separator', () => {
    // A bold mid-word span splits "Reproducible" into three text nodes that
    // share the same paragraph — they must read back as one word (Phase 1.1).
    const document = doc([
      paragraph([
        text('Re'),
        text('produc', [{ type: 'bold' }]),
        text('ible'),
      ]),
    ])

    expect(extractDocumentText(document, 100)).toBe('Reproducible')
  })

  it('inserts a separator between sibling blocks', () => {
    const document = doc([paragraph([text('First line')]), paragraph([text('Second line')])])

    expect(extractDocumentText(document, 100)).toBe('First line Second line')
  })

  it('separates text across nested containers such as list items', () => {
    const document = doc([
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [paragraph([text('Buy milk')])] },
          { type: 'listItem', content: [paragraph([text('Call mom')])] },
        ],
      },
    ])

    expect(extractDocumentText(document, 100)).toBe('Buy milk Call mom')
  })

  it('truncates at the requested limit', () => {
    const document = doc([paragraph([text('a'.repeat(500))])])

    expect(extractDocumentText(document, 20)).toHaveLength(20)
  })

  it('stops walking once enough text has been collected (И3)', () => {
    // 20k one-word paragraphs stand in for a chat note with 20k messages.
    // Only the early blocks should ever be visited.
    let visited = 0
    const content: DocumentNode[] = []

    for (let index = 0; index < 20_000; index += 1) {
      content.push({
        type: 'paragraph',
        get content() {
          visited += 1
          return [text(`message${index}`)]
        },
      } as unknown as DocumentNode)
    }

    const result = extractDocumentText(doc(content), 180)

    expect(result.startsWith('message0 message1')).toBe(true)
    expect(visited).toBeLessThan(20_000)
  })

  it('produces search text lowercased and preview text capped at 180 chars', () => {
    const document = noteDocument([paragraph([text('Loud Title Case Text')])])

    expect(createNoteSearchText(document)).toBe('loud title case text')
    expect(createNotePreview(document).length).toBeLessThanOrEqual(180)
  })
})

describe('deriveTitleFromDocument', () => {
  it('uses the first non-empty line, joining marked runs without a space', () => {
    const document = doc([
      paragraph([text('Re'), text('produc', [{ type: 'bold' }]), text('ible')]),
      paragraph([text('second line')]),
    ])

    expect(deriveTitleFromDocument(document)).toBe('Reproducible')
  })

  it('skips leading empty paragraphs', () => {
    const document = doc([paragraph([]), paragraph([text('')]), paragraph([text('Real title')])])

    expect(deriveTitleFromDocument(document)).toBe('Real title')
  })

  it('takes only the first item of a leading list, not the whole list', () => {
    const document = doc([
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [paragraph([text('Buy milk')])] },
          { type: 'listItem', content: [paragraph([text('Call mom')])] },
        ],
      },
    ])

    expect(deriveTitleFromDocument(document)).toBe('Buy milk')
  })

  it('returns an empty string for a document with no text', () => {
    const document = doc([{ type: 'horizontalRule' }, paragraph([])])

    expect(deriveTitleFromDocument(document)).toBe('')
  })
})
