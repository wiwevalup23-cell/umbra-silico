import type { DocumentNode, NoteDocument, TextMark } from '@/shared/contracts/document'

/**
 * Faces dropped from the editor's font palette, mapped to the closest
 * survivor. A document stores whatever raw `font-family` value was picked, so
 * without a rewrite a note written in Caveat would go on asking for a face the
 * product no longer ships — and silently fall back to whatever the browser
 * chooses. An empty replacement means "no explicit face": the text returns to
 * the document default.
 */
export const retiredDocumentFonts: Record<string, string> = {
  'Caveat Variable': 'SN EB Garamond',
  'Inter Variable': '',
  'Roboto Slab Variable': 'Lora Variable',
}

function rewriteMark(mark: TextMark): TextMark | null {
  if (mark.type !== 'textStyle' || !mark.attrs) {
    return null
  }

  const fontFamily = mark.attrs.fontFamily

  if (typeof fontFamily !== 'string' || !(fontFamily in retiredDocumentFonts)) {
    return null
  }

  const replacement = retiredDocumentFonts[fontFamily]

  if (replacement) {
    return { ...mark, attrs: { ...mark.attrs, fontFamily: replacement } }
  }

  // Drop the attribute rather than storing an empty family, which would
  // serialize to a broken `font-family: ` declaration.
  const rest = Object.fromEntries(
    Object.entries(mark.attrs).filter(([key]) => key !== 'fontFamily'),
  )
  return { ...mark, attrs: rest }
}

function rewriteNode(node: DocumentNode): { changed: boolean; node: DocumentNode } {
  let changed = false
  let next = node

  const marks = (node as { marks?: TextMark[] }).marks

  if (Array.isArray(marks)) {
    const rewritten = marks.map((mark) => {
      const replacement = rewriteMark(mark)

      if (replacement) {
        changed = true
        return replacement
      }

      return mark
    })

    if (changed) {
      next = { ...next, marks: rewritten } as DocumentNode
    }
  }

  if (Array.isArray(node.content)) {
    let contentChanged = false
    const content = node.content.map((child) => {
      const result = rewriteNode(child as DocumentNode)

      if (result.changed) {
        contentChanged = true
      }

      return result.node
    })

    if (contentChanged) {
      changed = true
      next = { ...next, content }
    }
  }

  return { changed, node: next }
}

/**
 * Rewrites every retired font reference in a document. Returns the original
 * object untouched when nothing matched, so callers can skip the write.
 */
export function migrateRetiredDocumentFonts(document: NoteDocument): {
  changed: boolean
  document: NoteDocument
} {
  const result = rewriteNode(document.content)

  return result.changed
    ? { changed: true, document: { ...document, content: result.node } }
    : { changed: false, document }
}
