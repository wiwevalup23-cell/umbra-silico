import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import {
  documentNodeSchema,
  parseNoteDocument,
  type NoteDocument,
} from '@/shared/contracts/document'
import { sanitizeDocumentTextStyles } from '@/ui/document'
import {
  currentPageLayoutVersion,
  defaultPageSideMargin,
} from './extensions/page-layout'

/**
 * What gets stored for a typed title: the text, trimmed.
 *
 * An empty result is stored as empty. Naming an untitled note is the job of
 * whatever draws it, in the reader's own language — writing `'Untitled'` into
 * the database gave a Russian reader an English word that switching language
 * would not change.
 */
export function normalizeTitle(title: string): string {
  return title.trim()
}

/**
 * A document ProseMirror can mount. An empty `content` array is legal in the
 * stored schema but not in the editor, which needs at least one text block to
 * put a caret in.
 *
 * This is also where a stored document is stripped of style attributes it is
 * not entitled to carry, so the editor state never holds one — and so the note
 * is cleaned in storage on its next save rather than only at render.
 */
export function normalizeEditorContent(document: NoteDocument) {
  const content = document.content.content?.length
    ? document.content
    : {
        ...document.content,
        content: [{ type: 'paragraph' }],
      }

  const sanitized = sanitizeDocumentTextStyles(content)
  const attrs = sanitized.attrs
  const storedLayoutVersion =
    typeof attrs?.pageLayoutVersion === 'number'
      ? attrs.pageLayoutVersion
      : null

  /* Layouts before v3 used a `ch`-limited text measure as a stand-in for page
     margins. That made the visible right margin depend on font metrics and
     window width, so it could never be reliably symmetric. Replace the old
     attributes once with a real shared side margin; the page's vertical
     choices survive the migration unchanged. */
  const hasLegacyPageLayout = Boolean(
    attrs &&
      (attrs.pageMeasure !== undefined ||
        attrs.pageMeasureVersion !== undefined ||
        (storedLayoutVersion !== null &&
          storedLayoutVersion < currentPageLayoutVersion) ||
        (attrs.pageLayoutVersion === undefined &&
          (attrs.pageHeaderOffset !== undefined ||
            attrs.pageFooterOffset !== undefined))),
  )

  let normalized = sanitized

  if (attrs && hasLegacyPageLayout) {
    const migratedAttrs = { ...attrs }
    delete migratedAttrs.pageMeasure
    delete migratedAttrs.pageMeasureVersion
    migratedAttrs.pageSideMargin =
      typeof migratedAttrs.pageSideMargin === 'number'
        ? migratedAttrs.pageSideMargin
        : defaultPageSideMargin
    migratedAttrs.pageLayoutVersion = currentPageLayoutVersion
    normalized = { ...sanitized, attrs: migratedAttrs }
  }

  return documentNodeSchema.parse(normalized)
}

/**
 * Serializes and validates a ProseMirror document for storage.
 *
 * Deliberately takes the document node rather than its JSON: capturing the
 * node is free, and this call is the expensive one — a full tree walk to
 * serialize, then a full recursive schema parse over the result, 10 ms on a
 * long note. It used to run on every keystroke to build a payload the *next*
 * keystroke threw away, because the autosave is debounced and only the last
 * one is ever saved. A ProseMirror node is immutable, so holding the reference
 * is as good as holding a copy, and the work now happens once per save.
 */
export function createDocumentFromEditorDoc(doc: ProseMirrorNode): NoteDocument {
  return parseNoteDocument({
    schemaVersion: 1,
    editor: 'tiptap',
    content: doc.toJSON(),
  })
}

export function isSameContent(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
