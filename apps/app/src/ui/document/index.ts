/**
 * The document kernel: what a note *is*, independent of how it is presented.
 *
 * Two surfaces render the same document — the block editor and the chat feed —
 * so the vocabulary they share (text styling, the image resolver) belongs to
 * neither of them. Without this module chat imported the editor, which meant
 * the message feed dragged TipTap, ProseMirror and KaTeX into its chunk for
 * the sake of two constants.
 */
export { ImageSourceContext } from './image-source-context'
export {
  editorFontOptions,
  editorHighlightOptions,
  editorTextSizeOptions,
  NoteTextStyleExtensions,
  readDocumentFontFamily,
  readDocumentFontSize,
  readHighlightColor,
  type EditorFontOption,
  type EditorHighlightOption,
  type EditorTextSizeOption,
} from './rich-text'
export { sanitizeDocumentTextStyles } from './sanitize-text-styles'
