import { Editor, type JSONContent } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BlockHandle } from '@/ui/editor/BlockHandle'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const cleanupTasks: Array<() => void> = []

afterEach(() => {
  while (cleanupTasks.length > 0) {
    cleanupTasks.pop()?.()
  }
})

function paragraph(text: string): JSONContent {
  return { type: 'paragraph', content: [{ type: 'text', text }] }
}

function mountEditorWithHandle() {
  const container = document.createElement('div')
  const frame = document.createElement('div')
  const editorHost = document.createElement('div')
  const handleHost = document.createElement('div')

  frame.className = 'sn-page-layout-frame'
  frame.append(handleHost, editorHost)
  container.append(frame)
  document.body.append(container)

  const editor = new Editor({
    element: editorHost,
    content: { type: 'doc', content: [paragraph('Alpha')] },
    extensions: [StarterKit],
  })
  const root = createRoot(handleHost)

  act(() => {
    root.render(<BlockHandle editor={editor} />)
  })

  cleanupTasks.push(() => {
    act(() => {
      root.unmount()
    })
    editor.destroy()
    container.remove()
  })

  return { editor, root }
}

async function waitOneFrame() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
  })
}

describe('the block handle position while typing', () => {
  it('reads layout once per rendered frame, not once per event', async () => {
    const { editor } = mountEditorWithHandle()

    // Let the mount's own measurement settle before the spy starts counting.
    await waitOneFrame()

    const coordsAtPos = vi.spyOn(editor.view, 'coordsAtPos')

    // Five keystrokes' worth of transactions landing before the browser gets
    // a chance to paint — what happens whenever someone types faster than one
    // character per frame. Each insertion fires both `update` (the doc
    // changed) and `selectionUpdate` (the caret moved), so this is ten
    // triggers for one measurement.
    act(() => {
      for (let i = 0; i < 5; i += 1) {
        editor.commands.insertContent('x')
      }
    })

    // Deferred to the next frame, not read synchronously inside the handlers
    // — that synchronous read was the forced layout this fix removes.
    expect(coordsAtPos).not.toHaveBeenCalled()

    await waitOneFrame()

    expect(coordsAtPos).toHaveBeenCalledTimes(1)
  })

  it('still recalculates on the next frame, rather than only the first', async () => {
    const { editor } = mountEditorWithHandle()

    await waitOneFrame()

    const coordsAtPos = vi.spyOn(editor.view, 'coordsAtPos')

    act(() => {
      editor.commands.insertContent('a')
    })
    await waitOneFrame()

    act(() => {
      editor.commands.insertContent('b')
    })
    await waitOneFrame()

    // Coalescing within a frame must not turn into throttling across frames:
    // two separate bursts get two separate reads.
    expect(coordsAtPos).toHaveBeenCalledTimes(2)
  })

  it('cancels a pending measurement if the note changes before the frame fires', async () => {
    const { editor, root } = mountEditorWithHandle()

    await waitOneFrame()

    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame')

    act(() => {
      editor.commands.insertContent('x') // schedules a frame that never runs
    })

    // `NoteEditor` remounts a fresh editor by `key={note.id}` on every note
    // switch, unmounting the old `BlockHandle` — possibly mid-keystroke, if
    // the switch and a still-pending autosave race. A frame left dangling
    // here would fire after unmount and read a destroyed editor's layout.
    act(() => {
      root.unmount()
    })

    expect(cancelAnimationFrame).toHaveBeenCalledOnce()
  })
})
