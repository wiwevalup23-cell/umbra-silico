/**
 * The note editor.
 *
 * This barrel is the module's only entry point — `boundaries/entry-point` and
 * `architecture.test.ts` both enforce it. Reach for a file inside `ui/editor/`
 * directly and the build fails, which is what keeps the editor swappable: the
 * workspace knows a component and six props, not TipTap.
 */

// The editing surface, and the contracts the app fulfils for it.
export { EditorShell, type EditorShellProps } from './EditorShell'
export type {
  EditorShellApi,
  ImportImageHandler,
  ImportedImageInfo,
} from './NoteEditor'
