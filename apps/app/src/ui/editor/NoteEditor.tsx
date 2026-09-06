import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'
import type { NoteDocument } from '@/shared/contracts/document'
import type { ImageSourceResolver } from '@/shared/contracts/image'
import type { NoteId, PlaintextLocalNote } from '@/shared/contracts/note'
import { BlockHandle } from './BlockHandle'
import { getCurrentTopLevelBlockRange } from './block-actions'
import { createDebouncedAutosave, type AutosaveStatus } from './debounced-autosave'
import { mergeAutosaveStatus } from './autosave-status'
import {
  createDocumentFromEditorDoc,
  isSameContent,
  normalizeEditorContent,
  normalizeTitle,
} from './document-content'
import { exportNoteToPdf } from './export-note-pdf'
import {
  createNoteEditorExtensions,
  defaultPageLayout,
  getPageLayout,
  type MathKind,
} from './extensions'
import { ImageSourceContext } from '@/ui/document'
import { remapMathPosition } from './math/math-position'
import { MathEditorPanel, type MathEditorDraft } from './math/MathEditorPanel'
import { EditorToolbar } from './toolbar/EditorToolbar'
import { SquircleButton } from '@/ui/components/silicon/SquircleButton'
import { LegacyUiIcon } from '@/ui/icons/ui/LegacyUiIcon'
import { UiIcon } from '@/ui/icons/ui/UiIcon'
import { useTranslation } from '@/ui/i18n/use-translation'
import { getLocalSavePresentation } from '@/ui/note-presentation'

// Structural mirror of the repository's ImportedImage: UI stays decoupled
// from the repository layer.
export type ImportedImageInfo = {
  imageId: string
  width: number
  height: number
}

export type ImportImageHandler = (
  noteId: NoteId,
  file: File,
) => Promise<ImportedImageInfo>

export type EditorShellApi = {
  revealImage(imageId: string): void
}

export type NoteEditorProps = {
  note: PlaintextLocalNote
  /**
   * Both writes answer with the `localRevision` they produced, which is how
   * the editor tells its own save coming back through the live query from a
   * change made anywhere else.
   */
  onChangeDocument: (noteId: NoteId, document: NoteDocument) => Promise<number>
  onChangeTitle: (noteId: NoteId, title: string) => Promise<number>
  editorApiRef?: { current: EditorShellApi | null }
  imageResolver?: ImageSourceResolver | null
  onImportImage?: ImportImageHandler | null
  /** The workspace element that scrolls; see `EditorShellProps`. */
  scrollContainerRef?: RefObject<HTMLElement | null>
}

type DocumentAutosavePayload = {
  doc: ProseMirrorNode
  noteId: NoteId
}

type TitleAutosavePayload = {
  noteId: NoteId
  title: string
}

const acceptedImageTypes = 'image/jpeg,image/png,image/webp,image/gif,image/avif'

function pickImageFiles(files: FileList | null | undefined): File[] {
  return files ? [...files].filter((file) => file.type.startsWith('image/')) : []
}

/**
 * Manual-save model: the user commits changes with the Save button (or
 * Ctrl/Cmd+S), while a near-real-time background autosave is the actual
 * safety net against losing work to a crash or a closed tab. It can stay this
 * short because a save landing does not disturb the editor: the incoming
 * document is matched against the revision of the last write, so our own echo
 * is recognised rather than applied.
 */
const backgroundAutosaveIntervalMs = 800

export function NoteEditor({
  note,
  onChangeDocument,
  onChangeTitle,
  editorApiRef,
  imageResolver = null,
  onImportImage = null,
  scrollContainerRef,
}: NoteEditorProps) {
  const { t } = useTranslation()
  const [titleDraft, setTitleDraft] = useState(note.title)
  const [documentStatus, setDocumentStatus] = useState<AutosaveStatus>('idle')
  const [titleStatus, setTitleStatus] = useState<AutosaveStatus>('idle')
  const [importNotice, setImportNotice] = useState<string | null>(null)
  const [importingCount, setImportingCount] = useState(0)
  const [mathDraft, setMathDraft] = useState<MathEditorDraft | null>(null)
  const didFocusEmptyNoteRef = useRef(false)
  // Mounting adopts the note as delivered, so the editor starts out standing
  // for exactly the stored revision.
  const lastWrittenRevisionRef = useRef(note.localRevision)
  const onChangeDocumentRef = useRef(onChangeDocument)
  const onChangeTitleRef = useRef(onChangeTitle)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // The page frame is the block handle's origin for positioning and the target
  // for block drops. Handing over the element beats having the handle look for
  // it by the class name this component happens to render.
  const pageFrameRef = useRef<HTMLDivElement>(null)
  const insertImageFilesRef = useRef<
    ((files: File[], dropPos: number | null) => Promise<void>) | null
  >(null)
  const documentAutosave = useMemo(
    () =>
      createDebouncedAutosave<DocumentAutosavePayload>({
        delayMs: backgroundAutosaveIntervalMs,
        onStatusChange: setDocumentStatus,
        async save(payload) {
          lastWrittenRevisionRef.current = await onChangeDocumentRef.current(
            payload.noteId,
            createDocumentFromEditorDoc(payload.doc),
          )
        },
      }),
    [],
  )
  const titleAutosave = useMemo(
    () =>
      createDebouncedAutosave<TitleAutosavePayload>({
        delayMs: backgroundAutosaveIntervalMs,
        onStatusChange: setTitleStatus,
        async save(payload) {
          // The title shares the note's revision counter with the document, so
          // its writes have to be recorded here too or the next document
          // delivery would look like somebody else's.
          lastWrittenRevisionRef.current = await onChangeTitleRef.current(
            payload.noteId,
            normalizeTitle(payload.title),
          )
        },
      }),
    [],
  )
  const initialContent = useMemo(
    () => normalizeEditorContent(note.document),
    [note.document],
  )
  const editor = useEditor({
    autofocus: false,
    content: initialContent,
    editorProps: {
      attributes: {
        'aria-label': t('editor.noteBody'),
        'aria-multiline': 'true',
        class: 'sn-tiptap-prosemirror',
        'data-placeholder': t('editor.placeholder'),
        role: 'textbox',
        spellcheck: 'true',
      },
      handleKeyDown(_view, event) {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault()
          void Promise.all([titleAutosave.flush(), documentAutosave.flush()])
          return true
        }

        return false
      },
      handlePaste(_view, event) {
        const images = pickImageFiles(event.clipboardData?.files)

        if (images.length === 0) {
          return false
        }

        event.preventDefault()
        void insertImageFilesRef.current?.(images, null)
        return true
      },
      handleDrop(view, event, _slice, moved) {
        // `moved` covers blocks dragged within the editor; only external
        // file drops become image imports.
        const images = moved ? [] : pickImageFiles(event.dataTransfer?.files)

        if (images.length === 0) {
          return false
        }

        event.preventDefault()
        const dropPosition = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        })
        void insertImageFilesRef.current?.(images, dropPosition?.pos ?? null)
        return true
      },
    },
    extensions: createNoteEditorExtensions({
      onEditMath(kind, latex, pos) {
        setMathDraft({ kind, latex, mode: 'edit', pos })
      },
    }),
    immediatelyRender: false,
    onBlur() {
      void documentAutosave.flush()
    },
    onUpdate({ editor }) {
      documentAutosave.schedule({ doc: editor.state.doc, noteId: note.id })
    },
  })
  const isEditorFocused = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => currentEditor?.isFocused ?? false,
  }) ?? false
  const pageLayout = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) =>
      currentEditor ? getPageLayout(currentEditor.state) : defaultPageLayout,
  }) ?? defaultPageLayout
  const autosaveState = mergeAutosaveStatus(documentStatus, titleStatus)
  const savePresentation = getLocalSavePresentation(autosaveState)
  const statusBadges = [
    {
      icon: savePresentation.icon,
      label: t(savePresentation.badgeKey),
      title: t('editor.saveTitle', { state: t(savePresentation.labelKey) }),
    },
    {
      icon: 'shield' as const,
      label: t('editor.localOnly'),
      title: t('editor.privacyLocal'),
    },
  ]

  const canInsertImages = Boolean(onImportImage)

  async function insertImageFiles(files: File[], dropPos: number | null) {
    if (!editor || !onImportImage) {
      return
    }

    let insertAt = dropPos

    for (const file of files) {
      setImportingCount((count) => count + 1)

      try {
        // The blob is fully persisted before the node lands in the document,
        // so the document only ever references stored images.
        const imported = await onImportImage(note.id, file)
        const attrs = {
          imageId: imported.imageId,
          naturalWidth: imported.width,
          naturalHeight: imported.height,
        }

        if (insertAt !== null) {
          editor.chain().focus().insertImageBlockAt(insertAt, attrs).run()
          insertAt = null
        } else {
          const range = getCurrentTopLevelBlockRange(editor)
          const position = range ? range.to : editor.state.doc.content.size
          editor.chain().focus().insertImageBlockAt(position, attrs).run()
        }
      } catch (error) {
        setImportNotice(
          error instanceof Error ? error.message : t('editor.imageImportFailed'),
        )
      } finally {
        setImportingCount((count) => Math.max(0, count - 1))
      }
    }
  }

  insertImageFilesRef.current = canInsertImages ? insertImageFiles : null

  function openImagePicker() {
    fileInputRef.current?.click()
  }

  function openMathEditor(kind: MathKind) {
    setMathDraft({ kind, latex: '', mode: 'insert', pos: null })
  }

  function saveMathDraft() {
    if (!editor || !mathDraft?.latex.trim()) {
      return
    }

    const latex = mathDraft.latex.trim()
    const chain = editor.chain().focus()

    if (mathDraft.mode === 'insert') {
      if (mathDraft.kind === 'block') {
        chain.insertBlockMath({ latex }).run()
      } else {
        chain.insertInlineMath({ latex }).run()
      }
    } else if (mathDraft.kind === 'block' && mathDraft.pos !== null) {
      chain.updateBlockMath({ latex, pos: mathDraft.pos }).run()
    } else if (mathDraft.kind === 'inline' && mathDraft.pos !== null) {
      chain.updateInlineMath({ latex, pos: mathDraft.pos }).run()
    }

    setMathDraft(null)
  }

  function deleteMathDraft() {
    if (!editor || mathDraft?.mode !== 'edit' || mathDraft.pos === null) {
      return
    }

    const chain = editor.chain().focus()

    if (mathDraft.kind === 'block') {
      chain.deleteBlockMath({ pos: mathDraft.pos }).run()
    } else {
      chain.deleteInlineMath({ pos: mathDraft.pos }).run()
    }

    setMathDraft(null)
  }

  useEffect(() => {
    if (!editorApiRef) {
      return
    }

    editorApiRef.current = {
      revealImage(imageId) {
        if (!editor) {
          return
        }

        let foundPosition: number | null = null

        editor.state.doc.descendants((node, position) => {
          if (foundPosition !== null) {
            return false
          }

          if (node.type.name === 'imageBlock' && node.attrs.imageId === imageId) {
            foundPosition = position
            return false
          }

          return true
        })

        if (foundPosition === null) {
          return
        }

        editor.commands.setNodeSelection(foundPosition)
        const dom = editor.view.nodeDOM(foundPosition)

        if (dom instanceof HTMLElement) {
          dom.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }

        // The node view listens for this and drives the highlight from
        // React state, so its own re-renders can't wipe the class.
        document.dispatchEvent(
          new CustomEvent('sn-image-flash', { detail: { imageId } }),
        )
      },
    }

    return () => {
      editorApiRef.current = null
    }
  }, [editor, editorApiRef])

  useEffect(() => {
    onChangeDocumentRef.current = onChangeDocument
  }, [onChangeDocument])

  // The editor is built once, so its accessible name and placeholder would
  // otherwise keep the locale that happened to be active at mount.
  useEffect(() => {
    if (!editor) return

    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: {
          ...(editor.options.editorProps.attributes as Record<string, string>),
          'aria-label': t('editor.noteBody'),
          'data-placeholder': t('editor.placeholder'),
        },
      },
    })
    // The empty-note placeholder is drawn by CSS on the first paragraph, which
    // cannot read an attribute set on the editor root — so the copy travels
    // down as a custom property instead of being frozen into the stylesheet.
    editor.view.dom.style.setProperty(
      '--sn-editor-placeholder',
      JSON.stringify(t('editor.placeholder')),
    )
    editor.view.dispatch(editor.state.tr)
  }, [editor, t])

  useEffect(() => {
    if (!editor || didFocusEmptyNoteRef.current || !editor.isEmpty) {
      return
    }

    // The ref is set once the rAF actually fires, not when it's scheduled:
    // StrictMode's mount→cleanup→mount cancels the first rAF, and marking the
    // ref up front would make the second (real) pass see it as already done.
    const focusFrame = window.requestAnimationFrame(() => {
      didFocusEmptyNoteRef.current = true
      editor.commands.focus('start')
    })

    return () => window.cancelAnimationFrame(focusFrame)
  }, [editor])

  useEffect(() => {
    onChangeTitleRef.current = onChangeTitle
  }, [onChangeTitle])

  useEffect(() => {
    setMathDraft(null)
  }, [note.id])

  useEffect(() => {
    if (!editor) {
      return
    }

    // The panel opens on a click and leaves the document editable, so the
    // position it was opened with stops pointing at the formula as soon as
    // anything above it changes length. Following each change keeps the panel
    // aimed at the formula it belongs to; losing it means the confirmed edit
    // silently does nothing, because the update command checks what it finds
    // and declines.
    function followDocumentChanges({ transaction }: { transaction: Transaction }) {
      if (!transaction.docChanged) {
        return
      }

      setMathDraft((draft) => {
        if (!draft || draft.pos === null) {
          return draft
        }

        const position = remapMathPosition(draft.pos, transaction)

        // Deleted out from under the panel: there is nothing left to edit.
        return position === null ? null : { ...draft, pos: position }
      })
    }

    editor.on('transaction', followDocumentChanges)

    return () => {
      editor.off('transaction', followDocumentChanges)
    }
  }, [editor])

  useEffect(() => {
    // Don't clobber a title the user is still typing: with the manual-save
    // model the incoming prop can only be the echo of our own save.
    if (titleAutosave.hasPending()) {
      return
    }

    setTitleDraft(note.title)
  }, [note.id, note.title, titleAutosave])

  useEffect(() => {
    if (!editor) {
      return
    }

    // A draft the store has not seen is newer than anything it can deliver.
    if (documentAutosave.hasPending()) {
      return
    }

    // Our own save coming back. Nothing to do — but the editor's content now
    // stands for this revision, so remember it, or the next delivery would
    // look newer than it is.
    if (note.localRevision <= lastWrittenRevisionRef.current) {
      lastWrittenRevisionRef.current = note.localRevision
      return
    }

    // Genuinely somebody else's write: another window, a sync, or a version
    // restored from history. Deferred while the caret is in the document,
    // because replacing it would drop the selection mid-sentence — the effect
    // runs again on blur, so nothing is lost by waiting.
    if (isEditorFocused) {
      return
    }

    const nextContent = normalizeEditorContent(note.document)

    if (!isSameContent(editor.getJSON(), nextContent)) {
      editor.commands.setContent(nextContent, { emitUpdate: false })
    }

    lastWrittenRevisionRef.current = note.localRevision
  }, [documentAutosave, editor, isEditorFocused, note.document, note.localRevision])

  useEffect(
    () => () => {
      void titleAutosave.flush()
      void documentAutosave.flush()
    },
    [documentAutosave, note.id, titleAutosave],
  )

  useEffect(() => {
    function flushPendingChanges() {
      void titleAutosave.flush()
      void documentAutosave.flush()
    }

    function flushWhenHidden() {
      if (document.visibilityState === 'hidden') {
        flushPendingChanges()
      }
    }

    document.addEventListener('visibilitychange', flushWhenHidden)
    window.addEventListener('beforeunload', flushPendingChanges)
    window.addEventListener('pagehide', flushPendingChanges)

    return () => {
      document.removeEventListener('visibilitychange', flushWhenHidden)
      window.removeEventListener('beforeunload', flushPendingChanges)
      window.removeEventListener('pagehide', flushPendingChanges)
    }
  }, [documentAutosave, titleAutosave])

  return (
    <div
      className="sn-editor-paper-sheet"
      style={
        {
          '--sn-page-footer-offset': `${pageLayout.pageFooterOffset}px`,
          '--sn-page-header-offset': `${pageLayout.pageHeaderOffset}px`,
          '--sn-page-side-margin': `${pageLayout.pageSideMargin}px`,
        } as CSSProperties
      }
    >
      <header className="sn-editor-topbar">
        <div className="sn-editor-title-row">
          <div className="sn-editor-title-group">
            <span className="sn-editor-icon">
              <LegacyUiIcon name="document" />
            </span>
            <label className="sn-editor-title-label" htmlFor="sn-editor-title">
              <span className="sn-sr-only">{t('editor.noteTitle')}</span>
              <input
                aria-label={t('editor.noteTitle')}
                className="sn-editor-document-title sn-editor-title-input"
                id="sn-editor-title"
                onBlur={() => {
                  void titleAutosave.flush()
                }}
                onChange={(event) => {
                  setTitleDraft(event.target.value)
                  titleAutosave.schedule({
                    noteId: note.id,
                    title: event.target.value,
                  })
                }}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                    event.preventDefault()
                    void Promise.all([titleAutosave.flush(), documentAutosave.flush()])
                    return
                  }

                  if (event.key === 'Enter') {
                    event.preventDefault()
                    editor?.chain().focus().run()
                  }
                }}
                value={titleDraft}
              />
            </label>
          </div>
          <div className="sn-editor-status-badges" aria-label={t('editor.noteStatus')}>
            {statusBadges.map((badge) => (
              <span className="sn-editor-status-badge" key={badge.title} title={badge.title}>
                <UiIcon name={badge.icon} />
                {badge.label}
              </span>
            ))}
          </div>
          <div className="sn-editor-actions">
            <SquircleButton
              aria-label={t('editor.exportPdf')}
              className="sn-pdf-export-button"
              icon="download"
              onClick={() => exportNoteToPdf(titleDraft, t('note.untitled'))}
              size="small"
              title={t('editor.exportPdfHint')}
            />
            <SquircleButton
              aria-label={t('editor.saveNote')}
              disabled={autosaveState === 'saved' || autosaveState === 'saving'}
              icon="save"
              onClick={() => {
                void Promise.all([titleAutosave.flush(), documentAutosave.flush()])
              }}
              size="small"
              title={t('editor.saveNoteHint')}
            />
          </div>
        </div>
      </header>

      <EditorToolbar
        editor={editor}
        onInsertImage={canInsertImages ? openImagePicker : null}
        onOpenMath={openMathEditor}
      />

      {mathDraft ? (
        <MathEditorPanel
          draft={mathDraft}
          onCancel={() => setMathDraft(null)}
          onChange={(latex) => setMathDraft((draft) => (draft ? { ...draft, latex } : draft))}
          onDelete={mathDraft.mode === 'edit' ? deleteMathDraft : null}
          onSave={saveMathDraft}
        />
      ) : null}

      {canInsertImages ? (
        <input
          accept={acceptedImageTypes}
          aria-label={t('editor.addImages')}
          hidden
          multiple
          onChange={(event) => {
            const files = pickImageFiles(event.target.files)
            event.target.value = ''

            if (files.length > 0) {
              void insertImageFiles(files, null)
            }
          }}
          ref={fileInputRef}
          type="file"
        />
      ) : null}

      {importingCount > 0 || importNotice ? (
        <div aria-live="polite" className="sn-editor-notice" role="status">
          {importingCount > 0 ? (
            <span className="sn-editor-notice__busy">{t('editor.importingImage')}</span>
          ) : null}
          {importNotice ? (
            <>
              <span>{importNotice}</span>
              <button
                aria-label={t('editor.dismissMessage')}
                onClick={() => setImportNotice(null)}
                type="button"
              >
                <UiIcon name="close" />
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      <ImageSourceContext.Provider value={imageResolver}>
        <div className="sn-editor-paper sn-editor-paper--editable">
          <h1 className="sn-print-note-title">
            {normalizeTitle(titleDraft) || t('note.untitled')}
          </h1>
          <div className="sn-page-layout-frame" ref={pageFrameRef}>
            <div className="sn-editor-reading-column">
              <BlockHandle
                editor={editor}
                frameRef={pageFrameRef}
                onInsertImage={canInsertImages ? openImagePicker : null}
                scrollContainerRef={scrollContainerRef}
              />
              <EditorContent className="sn-editor-content" editor={editor} />
            </div>
          </div>
        </div>
      </ImageSourceContext.Provider>
    </div>
  )
}
