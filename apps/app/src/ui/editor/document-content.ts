import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import {
  documentNodeSchema,
  parseNoteDocument,
  type NoteDocument,
} from '@/shared/contracts/document'
import { sanitizeDocumentTextStyles } from '@/ui/document'

/** The fallback shown in place of a blank title. */
export function normalizeTitle(title: string): string {
  return title.trim() || 'Untitled'
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

  return documentNodeSchema.parse(sanitizeDocumentTextStyles(content))
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
