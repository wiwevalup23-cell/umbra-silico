import type { DocumentNode, NoteDocument, TextMark } from '@/shared/contracts/document'

/**
 * The style values a note document is entitled to carry.
 *
 * These live here rather than beside the toolbar because they are a fact about
 * the format, not about the picker: the repository has to enforce them on
 * documents that never pass a toolbar at all — a restored backup, a synced
 * note, a Telegram import. The names shown for them are the toolbar's business
 * and stay in `@/ui/document`.
 *
 * The reason a closed set exists: TipTap renders these three by interpolating
 * them into a `style` attribute, and `attrs` is free-form JSON, so a document
 * from elsewhere can carry `serif; background: url(https://…)` and turn a note
 * whose own badge reads "Local only" into a beacon that reports the reader's
 * address and reading time. CSS cannot run script, which is what makes this a
 * privacy hole rather than an XSS — the worse of the two for this product.
 */
export const documentFontFamilies = [
  'SN EB Garamond',
  'SN Cormorant Garamond',
  'Lora Variable',
  'Monaco, Menlo, monospace',
] as const

export const documentFontSizes = [
  '13px',
  '15px',
  '17px',
  '20px',
  '24px',
  '30px',
  '36px',
] as const

export type DocumentFontFamily = (typeof documentFontFamilies)[number]
export type DocumentFontSize = (typeof documentFontSizes)[number]

/**
 * Compares font stacks the way CSS means them rather than by spelling.
 *
 * The CSSOM quotes multi-word family names the moment a stack touches a real
 * `style` property, so the value that comes back from a copy-paste round trip
 * is `"SN EB Garamond"` where the palette holds `SN EB Garamond`. Matching on
 * the raw string would drop the face on every paste. Quotes and spacing are
 * the only things normalized away — nothing that could reintroduce a `;`.
 */
function normalizeFontStack(value: string): string {
  return value
    .split(',')
    .map((family) => family.trim().replace(/^(["'])(.*)\1$/, '$2').trim())
    .filter(Boolean)
    .join(', ')
}

const fontFamiliesByStack = new Map(
  documentFontFamilies.map((family) => [normalizeFontStack(family), family]),
)
const supportedFontSizes = new Set<string>(documentFontSizes)

/**
 * Returns the palette's own spelling, never the caller's. Echoing the input
 * back — even after it passed the check — would let an unexpected but
 * equivalent spelling reach the style attribute.
 */
export function readDocumentFontFamily(value: unknown): string | null {
  return typeof value === 'string'
    ? fontFamiliesByStack.get(normalizeFontStack(value)) ?? null
    : null
}

export function readDocumentFontSize(value: unknown): string | null {
  const fontSize = typeof value === 'string' ? value.trim() : null

  return fontSize && supportedFontSizes.has(fontSize) ? fontSize : null
}

/**
 * Any six-digit hex, not just the six on the palette: the shape alone rules
 * out a semicolon or a `url(`, and a highlight the user has already applied
 * should not vanish because the palette was restyled.
 */
export function readHighlightColor(value: unknown): string | null {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : null
}

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
 * Strips style attributes a document is not entitled to carry.
 *
 * Returns the original object untouched when nothing was off-palette, so the
 * common case costs one walk and no allocation — and callers that need to know
 * whether a stored note is worth rewriting can compare by identity.
 */
export function sanitizeDocumentTextStyles(node: DocumentNode): DocumentNode {
  return sanitizeNode(node).node
}

/**
 * The same scrub over a whole stored document.
 *
 * Returns the document it was given when nothing was off-palette, so a caller
 * walking every note can skip the write with a `!==` rather than a deep
 * compare — the shape `migrateRetiredDocumentFonts` already uses.
 */
export function sanitizeNoteDocumentStyles(document: NoteDocument): NoteDocument {
  const content = sanitizeNode(document.content)

  return content.changed ? { ...document, content: content.node } : document
}
