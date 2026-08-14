import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { parseNoteDocument } from '@/shared/contracts'
import {
  createDocumentFromEditorDoc,
  normalizeEditorContent,
} from '@/ui/editor/document-content'
import { createNoteEditorExtensions } from '@/ui/editor/extensions'

const editors: Editor[] = []

afterEach(() => {
  while (editors.length > 0) {
    editors.pop()?.destroy()
  }
})

function createEditor(text = 'Body'): Editor {
  const editor = new Editor({
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    },
    extensions: createNoteEditorExtensions({ onEditMath: () => {} }),
  })

  editors.push(editor)
  return editor
}

describe('the document the autosave carries', () => {
  it('is the document as it stood when it was captured', () => {
    const editor = createEditor('First')
    const captured = editor.state.doc

    editor.commands.setContent({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second' }] }],
    })

    // A ProseMirror node is immutable, which is what lets the autosave hold a
    // reference instead of a serialized copy: capturing costs nothing, and a
    // later edit cannot reach back into a payload already scheduled.
    expect(createDocumentFromEditorDoc(captured).content).toMatchObject({
      content: [{ content: [{ text: 'First' }] }],
    })
  })

  it('can still be serialized after the editor is gone', () => {
    const editor = createEditor('Unsaved work')
    const captured = editor.state.doc

    // Switching notes unmounts the editor and flushes on the way out. The
    // payload has to outlive the instance that produced it, which is why it
    // holds the document rather than a closure over the editor.
    editor.destroy()

    expect(createDocumentFromEditorDoc(captured).content).toMatchObject({
      content: [{ content: [{ text: 'Unsaved work' }] }],
    })
  })

  it('is a valid stored document', () => {
    const editor = createEditor()
    const document = createDocumentFromEditorDoc(editor.state.doc)

    expect(document.schemaVersion).toBe(1)
    expect(document.editor).toBe('tiptap')
    expect(() => parseNoteDocument(document)).not.toThrow()
  })
})

describe('a stored document on its way into the editor', () => {
  const hostile = 'serif; background: url(https://tracker.example/beacon.png)'

  function hostileDocument() {
    return parseNoteDocument({
      schemaVersion: 1,
      editor: 'tiptap',
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'looks ordinary',
                marks: [
                  { type: 'textStyle', attrs: { fontFamily: hostile } },
                  { type: 'highlight', attrs: { color: 'red; background-image: url(x)' } },
                ],
              },
            ],
          },
        ],
      },
    })
  }

  it('is stripped of style attributes it is not entitled to carry', () => {
    const content = normalizeEditorContent(hostileDocument())

    expect(JSON.stringify(content)).not.toContain('tracker.example')
    expect(JSON.stringify(content)).not.toContain('url(')
  })

  it('is written back clean, so the note is repaired on its next save', () => {
    const editor = new Editor({
      content: normalizeEditorContent(hostileDocument()),
      extensions: createNoteEditorExtensions({ onEditMath: () => {} }),
    })

    editors.push(editor)

    // Rendering already refused the value; this is the other half — without it
    // the editor would decline to draw the beacon and then faithfully save it
    // again, leaving it there for the next reader.
    expect(JSON.stringify(createDocumentFromEditorDoc(editor.state.doc))).not.toContain(
      'tracker.example',
    )
  })

  it('keeps the text and the marks that were legitimate', () => {
    const document = parseNoteDocument({
      schemaVersion: 1,
      editor: 'tiptap',
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'kept',
                marks: [
                  { type: 'bold' },
                  { type: 'textStyle', attrs: { fontFamily: 'Lora Variable', fontSize: hostile } },
                ],
              },
            ],
          },
        ],
      },
    })
    const serialized = JSON.stringify(normalizeEditorContent(document))

    // Only the offending attribute goes; the mark, its siblings and the text
    // stay where they were.
    expect(serialized).toContain('Lora Variable')
    expect(serialized).toContain('bold')
    expect(serialized).toContain('kept')
    expect(serialized).not.toContain('tracker.example')
  })

  it('leaves an untouched document as the very same object', () => {
    const document = parseNoteDocument({
      schemaVersion: 1,
      editor: 'tiptap',
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'plain' }] }],
      },
    })

    expect(normalizeEditorContent(document)).toEqual(document.content)
  })
})
