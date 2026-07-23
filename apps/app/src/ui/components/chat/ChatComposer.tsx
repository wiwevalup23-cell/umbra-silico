import { Extension } from '@tiptap/core'
import { Mathematics } from '@tiptap/extension-mathematics'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef, useState } from 'react'
import { documentNodeSchema, type ChatMessageContent } from '@/shared/contracts'
import { NoteTextStyleExtensions } from '@/ui/editor/rich-text'
import { UiIcon } from '@/ui/icons/ui/UiIcon'

export type ChatComposerProps = {
  autoFocus?: boolean
  initialContent?: ChatMessageContent | null
  onCancel?: (() => void) | null
  onPickImageFiles?: ((files: File[]) => void) | null
  onSubmit: (content: ChatMessageContent) => void
  placeholder?: string
  submitLabel?: string
}

function pickImageFiles(fileList: FileList | null | undefined): File[] {
  return Array.from(fileList ?? []).filter((file) => file.type.startsWith('image/'))
}

// Telegram-familiar input: Enter sends, Shift+Enter adds a line break (the
// StarterKit hard-break binding), Escape cancels an edit in progress.
export function ChatComposer({
  autoFocus = false,
  initialContent = null,
  onCancel = null,
  onPickImageFiles = null,
  onSubmit,
  placeholder = 'Message',
  submitLabel = 'Send message',
}: ChatComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isEmpty, setIsEmpty] = useState(
    !initialContent || initialContent.length === 0,
  )
  const submitRef = useRef<() => boolean>(() => false)
  const cancelRef = useRef<() => boolean>(() => false)
  const pickFilesRef = useRef<((files: File[]) => void) | null>(null)

  pickFilesRef.current = onPickImageFiles

  const editor = useEditor({
    autofocus: autoFocus ? 'end' : false,
    content:
      initialContent && initialContent.length > 0
        ? { type: 'doc', content: initialContent }
        : undefined,
    editorProps: {
      attributes: {
        'aria-label': 'Message input',
        'aria-multiline': 'true',
        class: 'sn-chat-composer__prosemirror',
        role: 'textbox',
        spellcheck: 'true',
      },
      handlePaste(_view, event) {
        const images = pickImageFiles(event.clipboardData?.files)

        if (images.length === 0 || !pickFilesRef.current) {
          return false
        }

        event.preventDefault()
        pickFilesRef.current(images)
        return true
      },
    },
    extensions: [
      StarterKit.configure({ heading: false }),
      ...NoteTextStyleExtensions,
      Mathematics.configure({
        katexOptions: {
          output: 'htmlAndMathml',
          strict: 'warn',
          throwOnError: false,
        },
      }),
      Extension.create({
        name: 'chatComposerKeymap',
        // Must outrank StarterKit's Enter handling (splitBlock etc.),
        // otherwise Enter inserts a paragraph instead of sending.
        priority: 1000,
        addKeyboardShortcuts() {
          return {
            Enter: () => submitRef.current(),
            Escape: () => cancelRef.current(),
          }
        },
      }),
    ],
    immediatelyRender: false,
    onUpdate({ editor: currentEditor }) {
      setIsEmpty(currentEditor.isEmpty)
    },
  })

  submitRef.current = () => {
    if (!editor || editor.isEmpty) {
      return false
    }

    const content = documentNodeSchema.array().parse(editor.getJSON().content ?? [])

    if (content.length === 0) {
      return false
    }

    onSubmit(content)
    editor.commands.clearContent(true)
    setIsEmpty(true)
    return true
  }

  cancelRef.current = () => {
    if (!onCancel) {
      return false
    }

    onCancel()
    return true
  }

  useEffect(() => {
    if (autoFocus && editor) {
      editor.commands.focus('end')
    }
  }, [autoFocus, editor])

  return (
    <div className="sn-chat-composer" data-empty={isEmpty}>
      {onPickImageFiles ? (
        <>
          <input
            accept="image/*"
            hidden
            multiple
            onChange={(event) => {
              const files = pickImageFiles(event.target.files)
              event.target.value = ''

              if (files.length > 0) {
                onPickImageFiles(files)
              }
            }}
            ref={fileInputRef}
            type="file"
          />
          <button
            aria-label="Attach image"
            className="sn-icon-button sn-chat-composer__attach"
            onClick={() => fileInputRef.current?.click()}
            title="Attach image"
            type="button"
          >
            <UiIcon name="image" />
          </button>
        </>
      ) : null}

      <div className="sn-chat-composer__input">
        {isEmpty ? (
          <span aria-hidden="true" className="sn-chat-composer__placeholder">
            {placeholder}
          </span>
        ) : null}
        <EditorContent editor={editor} />
      </div>

      {onCancel ? (
        <button
          aria-label="Cancel editing"
          className="sn-icon-button sn-chat-composer__cancel"
          onClick={onCancel}
          title="Cancel (Esc)"
          type="button"
        >
          <UiIcon name="close" />
        </button>
      ) : null}

      <button
        aria-label={submitLabel}
        className="sn-icon-button sn-icon-button--primary sn-chat-composer__send"
        disabled={isEmpty}
        onClick={() => submitRef.current()}
        title={`${submitLabel} (Enter)`}
        type="button"
      >
        <UiIcon name={onCancel ? 'check' : 'send'} />
      </button>
    </div>
  )
}
