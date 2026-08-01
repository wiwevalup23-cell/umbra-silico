import type { DocumentNode, NoteDocument, TextNode } from '@/shared/contracts/document'

/** How much of a note body is kept for search. */
export const noteSearchTextLimit = 100_000

/** How much of a note body is shown in list rows. */
export const notePreviewLimit = 180

function isTextNode(node: unknown): node is TextNode {
  return (
    node !== null &&
    typeof node === 'object' &&
    'type' in node &&
    'text' in node &&
    node.type === 'text' &&
    typeof node.text === 'string'
  )
}

function rootNode(document: NoteDocument | DocumentNode): DocumentNode {
  return 'schemaVersion' in document ? document.content : document
}

/**
 * Flattens a document to its plain text, capped at `limit` characters.
 *
 * Collection stops early once enough raw text has been gathered, which matters
 * for chat notes: their document can hold tens of thousands of messages, and a
 * 180-character preview must not pay to walk the whole feed on every save.
 * Whitespace collapses after collection, so the walk gathers some slack to
 * still fill the limit when the source text is padded.
 */
export function extractDocumentText(
  document: NoteDocument | DocumentNode,
  limit: number,
): string {
  const collectLimit = limit * 2 + 64
  const parts: string[] = []
  let collected = 0

  function walk(node: unknown): boolean {
    if (!node || typeof node !== 'object') {
      return true
    }

    if (isTextNode(node)) {
      parts.push(node.text)
      collected += node.text.length + 1
      return collected < collectLimit
    }

    if (!('content' in node) || !Array.isArray(node.content)) {
      return true
    }

    for (const child of node.content) {
      if (!walk(child)) {
        return false
      }
    }

    return true
  }

  walk(rootNode(document))

  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, limit)
}

export function createNotePreview(document: NoteDocument): string {
  return extractDocumentText(document, notePreviewLimit)
}

/**
 * The searchable body of a note, normalized for case-insensitive matching.
 * Only ever derived from plaintext: a locked note stores no search text, so
 * ciphertext never leaves a searchable shadow of its contents behind.
 */
export function createNoteSearchText(document: NoteDocument): string {
  return extractDocumentText(document, noteSearchTextLimit).toLocaleLowerCase()
}
