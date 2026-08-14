import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createDraftLocalNote,
  deviceIdSchema,
  noteIdSchema,
  parseNoteDocument,
  userIdSchema,
  type NoteDocument,
  type PlaintextLocalNote,
} from '@/shared/contracts'
import { EditorShell } from '@/ui/editor'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const cleanupTasks: Array<() => void> = []
const userId = userIdSchema.parse('revision_user')
const deviceId = deviceIdSchema.parse('revision_device')
const noteId = noteIdSchema.parse('note_revision')
const now = '2026-08-14T00:00:00.000Z'

afterEach(() => {
  while (cleanupTasks.length > 0) {
    cleanupTasks.pop()?.()
  }
  vi.restoreAllMocks()
})

function documentSaying(text: string): NoteDocument {
  return parseNoteDocument({
    schemaVersion: 1,
    editor: 'tiptap',
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    },
  })
}

/**
 * A note as the live query delivers it: a document at a given revision.
 *
 * `localRevision` is what tells the editor its own save coming back from
 * somebody else's write, so it is the field these tests turn.
 */
function noteAt(revision: number, text: string): PlaintextLocalNote {
  return {
    ...createDraftLocalNote({
      document: documentSaying(text),
      deviceId,
      id: noteId,
      now,
      title: 'Revision note',
      userId,
    }),
    localRevision: revision,
  }
}

function renderEditor(note: PlaintextLocalNote) {
  const container = document.createElement('div')

  document.body.append(container)

  const root = createRoot(container)
  const onChangeDocument = vi.fn(async () => note.localRevision + 1)

  function show(next: PlaintextLocalNote) {
    act(() => {
      root.render(
        <EditorShell
          note={next}
          onChangeDocument={onChangeDocument}
          onChangeTitle={vi.fn(async () => next.localRevision + 1)}
        />,
      )
    })
  }

  show(note)

  cleanupTasks.push(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  return { container, onChangeDocument, root: root as Root, show }
}

function bodyText(container: HTMLElement): string {
  return container.querySelector('.sn-tiptap-prosemirror')?.textContent ?? ''
}

describe('a document arriving while the editor is open', () => {
  it('shows the note it was opened with', () => {
    const { container } = renderEditor(noteAt(4, 'As stored'))

    expect(bodyText(container)).toBe('As stored')
  })

  it('ignores a delivery no newer than the editor’s own last write', () => {
    const { container, show } = renderEditor(noteAt(4, 'As stored'))

    // The same revision carrying different text can only be a delivery that
    // was already in flight — it cannot be newer than what the editor holds.
    show({ ...noteAt(4, 'Stale echo'), document: documentSaying('Stale echo') })

    expect(bodyText(container)).toBe('As stored')
  })

  it('adopts a document written by somebody else', () => {
    const { container, show } = renderEditor(noteAt(4, 'As stored'))

    // A version restored from history, another window, a sync: the revision
    // advanced without the editor having written anything.
    show(noteAt(5, 'Restored from history'))

    expect(bodyText(container)).toBe('Restored from history')
  })

  it('keeps taking later writes after adopting one', () => {
    const { container, show } = renderEditor(noteAt(4, 'As stored'))

    show(noteAt(5, 'First outside change'))
    expect(bodyText(container)).toBe('First outside change')

    show(noteAt(6, 'Second outside change'))
    expect(bodyText(container)).toBe('Second outside change')
  })

  it('waits for the caret to leave before replacing what is on screen', () => {
    const { container, show } = renderEditor(noteAt(4, 'As stored'))
    const body = container.querySelector<HTMLElement>('.sn-tiptap-prosemirror')

    expect(body).not.toBeNull()

    act(() => {
      body?.dispatchEvent(new FocusEvent('focus', { bubbles: false }))
    })

    show(noteAt(5, 'Written elsewhere'))

    // Replacing the document drops the selection, so an outside write waits
    // rather than pulling the ground out from under someone mid-sentence.
    expect(bodyText(container)).toBe('As stored')

    act(() => {
      body?.dispatchEvent(new FocusEvent('blur', { bubbles: false }))
    })

    // Waiting is only acceptable because the wait ends: the deferral used to
    // be permanent, since nothing re-examined a delivery once it was skipped.
    expect(bodyText(container)).toBe('Written elsewhere')
  })
})
