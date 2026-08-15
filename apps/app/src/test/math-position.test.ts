import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createNoteEditorExtensions } from '@/ui/editor/extensions'
import { remapMathPosition } from '@/ui/editor/math/math-position'

const editors: Editor[] = []

afterEach(() => {
  while (editors.length > 0) {
    editors.pop()?.destroy()
  }
})

/** A note with a formula between two paragraphs. */
function createEditorWithFormula(): { editor: Editor; mathPosition: number } {
  const editor = new Editor({
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Above' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Below' }] },
      ],
    },
    extensions: createNoteEditorExtensions({ onEditMath: () => undefined }),
  })

  editors.push(editor)
  editor.commands.setTextSelection(editor.state.doc.content.size - 1)
  editor.commands.insertBlockMath({ latex: 'E = mc^2' })

  return { editor, mathPosition: findMath(editor) }
}

function findMath(editor: Editor): number {
  let position = -1

  editor.state.doc.descendants((node, at) => {
    if (node.type.name === 'blockMath' && position === -1) {
      position = at
    }

    return true
  })

  return position
}

describe('the position the equation panel was opened on', () => {
  it('is what makes the confirmed edit land', () => {
    const { editor, mathPosition } = createEditorWithFormula()
    let followed: number | null = mathPosition

    editor.on('transaction', ({ transaction }) => {
      if (transaction.docChanged && followed !== null) {
        followed = remapMathPosition(followed, transaction)
      }
    })

    editor.commands.setTextSelection(2)
    editor.commands.insertContent('typed while the panel was open')

    // The stale position no longer names a formula, and the update command
    // checks what it finds — so it declines, and the edit the user typed and
    // confirmed is dropped without a word. That is the whole defect.
    expect(editor.state.doc.nodeAt(mathPosition)?.type.name).not.toBe('blockMath')
    expect(editor.can().updateBlockMath({ latex: 'a', pos: mathPosition })).toBe(false)

    // Followed through the change, it still names the formula, and the edit
    // reaches it.
    expect(followed).not.toBe(mathPosition)
    expect(editor.state.doc.nodeAt(followed as number)?.type.name).toBe('blockMath')
    expect(editor.commands.updateBlockMath({ latex: 'a^2 + b^2', pos: followed as number })).toBe(true)
    expect(editor.state.doc.nodeAt(findMath(editor))?.attrs.latex).toBe('a^2 + b^2')
  })

  it('reports the formula gone once it is deleted', () => {
    const { editor, mathPosition } = createEditorWithFormula()
    let followed: number | null = mathPosition

    editor.on('transaction', ({ transaction }) => {
      if (transaction.docChanged && followed !== null) {
        followed = remapMathPosition(followed, transaction)
      }
    })

    const node = editor.state.doc.nodeAt(mathPosition)

    expect(node).not.toBeNull()

    editor.view.dispatch(
      editor.state.tr.delete(mathPosition, mathPosition + (node?.nodeSize ?? 0)),
    )

    // Nothing left to edit, so the panel has to close rather than aim at
    // whatever moved into that position.
    expect(followed).toBeNull()
  })

  it('leaves the position alone when the change is below the formula', () => {
    const { editor, mathPosition } = createEditorWithFormula()
    let followed: number | null = mathPosition

    editor.on('transaction', ({ transaction }) => {
      if (transaction.docChanged && followed !== null) {
        followed = remapMathPosition(followed, transaction)
      }
    })

    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    editor.commands.insertContent('trailing words')

    expect(followed).toBe(mathPosition)
    expect(editor.state.doc.nodeAt(mathPosition)?.type.name).toBe('blockMath')
  })
})
