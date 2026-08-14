import {
  documentNodeSchema,
  parseNoteDocument,
  type NoteDocument,
} from '@/shared/contracts/document'

/** The fallback shown in place of a blank title. */
export function normalizeTitle(title: string): string {
  return title.trim() || 'Untitled'
}

/**
 * A document ProseMirror can mount. An empty `content` array is legal in the
 * stored schema but not in the editor, which needs at least one text block to
 * put a caret in.
 */
export function normalizeEditorContent(document: NoteDocument) {
  const content = document.content.content?.length
    ? document.content
    : {
        ...document.content,
        content: [{ type: 'paragraph' }],
      }

  return documentNodeSchema.parse(content)
}

export function createDocumentFromEditorJson(content: unknown): NoteDocument {
  return parseNoteDocument({
    schemaVersion: 1,
    editor: 'tiptap',
    content,
  })
}

export function isSameContent(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
