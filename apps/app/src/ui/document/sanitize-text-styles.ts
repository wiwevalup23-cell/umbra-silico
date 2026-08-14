import type { DocumentNode, TextMark } from '@/shared/contracts/document'
import {
  readDocumentFontFamily,
  readDocumentFontSize,
  readHighlightColor,
} from './rich-text'

/**
 * Strips style attributes a document is not entitled to carry.
 *
 * The marks refuse to *render* an off-palette value, which closes the beacon.
 * This closes the other half: a hostile value that arrived in a backup, a
 * Telegram export or a synced note would otherwise sit in storage untouched,
 * waiting for the next renderer that forgets to check — and be written back
 * out verbatim by the very editor that declined to draw it.
 *
 * Applied where a document enters the editor, so the ProseMirror state never
 * holds one, and every note the user opens is cleaned on its next save.
 */
function sanitizeMark(mark: TextMark): TextMark | null {
  if (!mark.attrs) {
    return null
  }

  const readers =
    mark.type === 'textStyle'
      ? ({ fontFamily: readDocumentFontFamily, fontSize: readDocumentFontSize } as const)
      : mark.type === 'highlight'
        ? ({ color: readHighlightColor } as const)
        : null

  if (!readers) {
    return null
  }

  const attrs = mark.attrs
  const offending = Object.entries(readers).filter(
    ([name, read]) => attrs[name] != null && read(attrs[name]) === null,
  )

  if (offending.length === 0) {
    return null
  }

  // Dropped rather than emptied: an attribute that is absent means "no
  // explicit style", which is exactly the intent, while `''` would serialize
  // to a broken declaration.
  const removed = new Set(offending.map(([name]) => name))

  return {
    ...mark,
    attrs: Object.fromEntries(
      Object.entries(attrs).filter(([name]) => !removed.has(name)),
    ),
  }
}

function sanitizeNode(node: DocumentNode): { changed: boolean; node: DocumentNode } {
  let changed = false
  let next = node

  const marks = (node as { marks?: TextMark[] }).marks

  if (Array.isArray(marks)) {
    const rewritten = marks.map((mark) => {
      const replacement = sanitizeMark(mark)

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
      const result = sanitizeNode(child as DocumentNode)

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
 * Returns the original object untouched when nothing was off-palette, so the
 * common case costs one walk and no allocation.
 */
export function sanitizeDocumentTextStyles(node: DocumentNode): DocumentNode {
  return sanitizeNode(node).node
}
