import type { DocumentNode, NoteDocument, TextNode } from '@/shared/contracts/document'

/** How much of a note body is kept for search. */
export const noteSearchTextLimit = 100_000

/** How much of a note body is shown in list rows. */
export const notePreviewLimit = 180

/** How much of a note's first line is used to derive an implicit title. */
export const noteTitleLimit = 200

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

  // Adjacent text nodes are mark boundaries splitting one run mid-word (e.g.
  // "Reproducible" becomes "Re" + "produc"(bold) + "ible"), so they must join
  // with no separator. A part boundary — and the one space `parts.join(' ')`
  // inserts between parts — belongs only between sibling blocks.
  function walk(node: unknown): boolean {
    if (
      !node ||
      typeof node !== 'object' ||
      !('content' in node) ||
      !Array.isArray(node.content)
    ) {
      return true
    }

    let run = ''

    const flushRun = () => {
      if (run.length === 0) {
        return
      }

      parts.push(run)
      collected += run.length + 1
      run = ''
    }

    for (const child of node.content) {
      if (isTextNode(child)) {
        run += child.text

        if (collected + run.length >= collectLimit) {
          flushRun()
          return false
        }

        continue
      }

      flushRun()

      if (collected >= collectLimit || !walk(child)) {
        return false
      }
    }

    flushRun()

    return collected < collectLimit
  }

  walk(rootNode(document))

  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, limit)
}

/**
 * The note's implicit title: the first block anywhere in the document that
 * carries any text, using the same no-separator joining `extractDocumentText`
 * uses within a block. Only a manually-typed title should ever override this.
 */
export function deriveTitleFromDocument(document: NoteDocument | DocumentNode): string {
  function firstLine(node: unknown): string | null {
    if (
      !node ||
      typeof node !== 'object' ||
      !('content' in node) ||
      !Array.isArray(node.content)
    ) {
      return null
    }

    let run = ''

    for (const child of node.content) {
      if (isTextNode(child)) {
        run += child.text
        continue
      }

      const trimmedRun = run.trim()

      if (trimmedRun.length > 0) {
        return trimmedRun
      }

      const nested = firstLine(child)

      if (nested !== null) {
        return nested
      }
    }

    const trimmedRun = run.trim()
    return trimmedRun.length > 0 ? trimmedRun : null
  }

  const line = firstLine(rootNode(document)) ?? ''

  return line.replace(/\s+/g, ' ').trim().slice(0, noteTitleLimit)
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
