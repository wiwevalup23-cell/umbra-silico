import type { RefObject } from 'react'
import type { NoteDocument } from '@/shared/contracts/document'
import type { ImageSourceResolver } from '@/shared/contracts/image'
import type { NoteId, PlaintextLocalNote } from '@/shared/contracts/note'
import {
  NoteEditor,
  type EditorShellApi,
  type ImportImageHandler,
} from './NoteEditor'
import { useTranslation } from '@/ui/i18n/use-translation'

export type EditorShellProps = {
  note: PlaintextLocalNote
  /** Both answer with the produced `localRevision`; see `NoteEditorProps`. */
  onChangeDocument: (noteId: NoteId, document: NoteDocument) => Promise<number>
  onChangeTitle: (noteId: NoteId, title: string) => Promise<number>
  editorApiRef?: { current: EditorShellApi | null }
  imageResolver?: ImageSourceResolver | null
  onImportImage?: ImportImageHandler | null
  /**
   * The element that scrolls the editor, which the workspace owns and the
   * editor fills. The block handle tracks the caret and so has to know when
   * that element moves under it; without one it simply stops following scroll.
   */
  scrollContainerRef?: RefObject<HTMLElement | null>
}

/**
 * The editor's public surface: a landmark region around exactly one editable
 * note.
 *
 * Which note that is — or whether the workspace has one at all, or has a
 * locked one, or a chat — is the workspace's decision, not the editor's. The
 * shell only guarantees that a different note gets a *different* editor: the
 * `key` remounts `NoteEditor`, which is what stops one note's autosave timers,
 * undo history and drafts leaking into the next.
 */
export function EditorShell({
  note,
  onChangeDocument,
  onChangeTitle,
  editorApiRef,
  imageResolver = null,
  onImportImage = null,
  scrollContainerRef,
}: EditorShellProps) {
  const { t } = useTranslation()

  return (
    <article className="sn-editor-shell" aria-label={t('editor.region')}>
      <NoteEditor
        editorApiRef={editorApiRef}
        imageResolver={imageResolver}
        key={note.id}
        note={note}
        onChangeDocument={onChangeDocument}
        onChangeTitle={onChangeTitle}
        onImportImage={onImportImage}
        scrollContainerRef={scrollContainerRef}
      />
    </article>
  )
}
