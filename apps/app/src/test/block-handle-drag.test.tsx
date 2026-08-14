import { Editor, type JSONContent } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { act, createRef } from 'react'
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

/**
 * jsdom ships no DataTransfer, and the grip's handlers only ever set data and
 * an effect on it.
 */
function createDataTransfer() {
  const store = new Map<string, string>()

  return {
    dropEffect: 'none',
    effectAllowed: 'none',
    setData(format: string, value: string) {
      store.set(format, value)
    },
    getData(format: string) {
      return store.get(format) ?? ''
    },
  }
}

function dispatchDragEvent(
  target: EventTarget,
  type: string,
  dataTransfer: ReturnType<typeof createDataTransfer>,
) {
  const event = new Event(type, { bubbles: true, cancelable: true })

  Object.defineProperties(event, {
    dataTransfer: { value: dataTransfer },
    clientX: { value: 40 },
    clientY: { value: 40 },
  })
  target.dispatchEvent(event)

  return event
}

function mountEditorWithHandle() {
  // jsdom has no layout, and ProseMirror's drop handler reaches for it before
  // doing anything else. Returning nothing lets its handler run and bail the
  // way it would over empty space, instead of throwing.
  const documentWithHitTesting = document as Document & {
    elementFromPoint?: (x: number, y: number) => Element | null
  }
  const previousElementFromPoint = documentWithHitTesting.elementFromPoint

  documentWithHitTesting.elementFromPoint = () => null
  cleanupTasks.push(() => {
    documentWithHitTesting.elementFromPoint = previousElementFromPoint
  })

  const container = document.createElement('div')
  const frame = document.createElement('div')
  const editorHost = document.createElement('div')
  const handleHost = document.createElement('div')

  frame.className = 'sn-page-layout-frame'
  frame.append(handleHost, editorHost)

  const frameRef = createRef<HTMLElement>() as { current: HTMLElement | null }
  frameRef.current = frame
  container.append(frame)
  document.body.append(container)

  const editor = new Editor({
    element: editorHost,
    content: {
      type: 'doc',
      content: [paragraph('Alpha'), paragraph('Beta'), paragraph('Gamma')],
    },
    extensions: [StarterKit],
  })
  const root = createRoot(handleHost)

  act(() => {
    root.render(<BlockHandle editor={editor} frameRef={frameRef} />)
  })

  cleanupTasks.push(() => {
    act(() => {
      root.unmount()
    })
    editor.destroy()
    container.remove()
  })

  return { editor, handleHost }
}

describe('dragging a block by its grip', () => {
  it('does not let the drop reach ProseMirror', () => {
    const { editor, handleHost } = mountEditorWithHandle()
    const dataTransfer = createDataTransfer()
    const grip = handleHost.querySelector('.sn-block-handle__button--grip')

    expect(grip).not.toBeNull()

    // ProseMirror listens on view.dom. Anything that arrives there during a
    // grip drag gets parsed out of the dataTransfer and pasted into the
    // document — the block position, "0", lands in the prose as text.
    const proseMirrorHandler = vi.fn()
    editor.view.dom.addEventListener('drop', proseMirrorHandler)

    act(() => {
      dispatchDragEvent(grip as Element, 'dragstart', dataTransfer)
    })

    // The position still travels as text/plain: browsers need a plain-text
    // payload to start a drag at all, which is precisely why the drop must
    // never be allowed to reach a handler that would paste it.
    expect(dataTransfer.getData('text/plain')).toBe('0')

    const dropEvent = dispatchDragEvent(editor.view.dom, 'drop', dataTransfer)

    expect(proseMirrorHandler).not.toHaveBeenCalled()
    expect(dropEvent.defaultPrevented).toBe(true)
    expect(editor.getText()).toBe('Alpha\n\nBeta\n\nGamma')
  })

  it('leaves drops that are not block drags alone', () => {
    const { editor } = mountEditorWithHandle()
    const dataTransfer = createDataTransfer()

    // An image file dropped from the desktop: no grip drag is in progress, so
    // the editor's own handler has to keep receiving it.
    const proseMirrorHandler = vi.fn()
    editor.view.dom.addEventListener('drop', proseMirrorHandler)

    dispatchDragEvent(editor.view.dom, 'drop', dataTransfer)

    expect(proseMirrorHandler).toHaveBeenCalledOnce()
  })

  it('forgets the dragged block once it has been dropped', () => {
    const { editor, handleHost } = mountEditorWithHandle()
    const dataTransfer = createDataTransfer()
    const grip = handleHost.querySelector('.sn-block-handle__button--grip')
    const proseMirrorHandler = vi.fn()

    act(() => {
      dispatchDragEvent(grip as Element, 'dragstart', dataTransfer)
    })

    dispatchDragEvent(editor.view.dom, 'drop', dataTransfer)
    editor.view.dom.addEventListener('drop', proseMirrorHandler)

    // A second, unrelated drop must not be swallowed as a block move: the
    // drag is over, and the source position it carried is long stale.
    dispatchDragEvent(editor.view.dom, 'drop', dataTransfer)

    expect(proseMirrorHandler).toHaveBeenCalledOnce()
  })
})
