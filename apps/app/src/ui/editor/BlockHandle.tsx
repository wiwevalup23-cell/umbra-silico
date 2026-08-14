import type { Editor } from '@tiptap/core'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import {
  deleteCurrentBlock,
  duplicateCurrentBlock,
  getCurrentTopLevelBlockRange,
  getTopLevelBlockRangeAtPosition,
  insertBlockBelow,
  moveBlockToPosition,
  moveCurrentBlock,
  type InsertBlockTarget,
} from './block-actions'
import { turnInto, type TurnIntoTarget } from './turn-into'
import { useTranslation } from '@/ui/i18n/use-translation'
import { UiIcon } from '@/ui/icons/ui/UiIcon'

type BlockHandleProps = {
  editor: Editor | null
  /**
   * The page frame the handle is positioned against and that block drops land
   * on. `NoteEditor` renders it and hands it over, rather than the handle
   * finding it by the class name that component happens to use.
   */
  frameRef: RefObject<HTMLElement | null>
  onInsertImage?: (() => void) | null
  /** The workspace element that scrolls; absent, the handle stops tracking it. */
  scrollContainerRef?: RefObject<HTMLElement | null>
}

type HandleMenu = 'actions' | 'insert'

const insertTargets: Array<{ label: string; target: InsertBlockTarget }> = [
  { label: 'Paragraph', target: 'paragraph' },
  { label: 'Heading', target: 'heading2' },
  { label: 'To-do', target: 'taskList' },
  { label: 'Toggle', target: 'toggle' },
  { label: 'Callout', target: 'callout' },
  { label: 'Divider', target: 'divider' },
  { label: 'Code', target: 'codeBlock' },
]

const turnTargets: Array<{ label: string; target: TurnIntoTarget }> = [
  { label: 'Text', target: 'paragraph' },
  { label: 'Heading 1', target: 'heading1' },
  { label: 'Heading 2', target: 'heading2' },
  { label: 'Heading 3', target: 'heading3' },
  { label: 'Bullets', target: 'bulletList' },
  { label: 'Numbers', target: 'orderedList' },
  { label: 'To-do', target: 'taskList' },
  { label: 'Quote', target: 'blockquote' },
  { label: 'Code', target: 'codeBlock' },
  { label: 'Callout', target: 'callout' },
  { label: 'Toggle', target: 'toggle' },
]

export function BlockHandle({
  editor,
  frameRef,
  onInsertImage = null,
  scrollContainerRef,
}: BlockHandleProps) {
  const { t } = useTranslation()
  const menuRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const draggedSourceRef = useRef<number | null>(null)
  const [activeMenu, setActiveMenu] = useState<HandleMenu | null>(null)
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 })
  const [top, setTop] = useState<number | null>(null)

  useEffect(() => {
    if (!editor) {
      setTop(null)
      return
    }

    const currentEditor = editor

    function measurePosition() {
      const range = getCurrentTopLevelBlockRange(currentEditor)
      const frame = frameRef.current

      if (!range || !frame) {
        setTop((currentTop) => currentTop ?? 48)
        return
      }

      const position = Math.min(range.from + 1, currentEditor.state.doc.content.size)
      const frameRect = frame.getBoundingClientRect()

      try {
        const coords = currentEditor.view.coordsAtPos(position)
        // CSS offsets the 24px button cluster by half of its own height, so
        // this value is the exact vertical midpoint of the active line.
        const lineMidpoint = (coords.top + coords.bottom) / 2
        setTop(Math.max(8, Math.round(lineMidpoint - frameRect.top)))
      } catch {
        setTop(48)
      }
    }

    // Typing a character fires both `update` (the doc changed) and
    // `selectionUpdate` (the caret moved) from the same transaction, and both
    // `getBoundingClientRect` and `coordsAtPos` force a synchronous layout —
    // so unguarded, every keystroke read layout twice, straight in the path
    // between the key going down and the letter appearing. Collapsing every
    // trigger inside a frame into one read, taken just before the browser's
    // own paint, keeps the position exactly as fresh — still recalculated
    // after every change — without the editor also being the reason that
    // frame had extra layout work in it.
    let pendingFrame: number | null = null

    function scheduleMeasurement() {
      if (pendingFrame !== null) {
        return
      }

      pendingFrame = window.requestAnimationFrame(() => {
        pendingFrame = null
        measurePosition()
      })
    }

    measurePosition()
    currentEditor.on('selectionUpdate', scheduleMeasurement)
    currentEditor.on('update', scheduleMeasurement)
    currentEditor.on('focus', scheduleMeasurement)
    window.addEventListener('resize', scheduleMeasurement)
    const scrollContainer = scrollContainerRef?.current
    scrollContainer?.addEventListener('scroll', scheduleMeasurement, { passive: true })

    return () => {
      if (pendingFrame !== null) {
        window.cancelAnimationFrame(pendingFrame)
      }

      currentEditor.off('selectionUpdate', scheduleMeasurement)
      currentEditor.off('update', scheduleMeasurement)
      currentEditor.off('focus', scheduleMeasurement)
      window.removeEventListener('resize', scheduleMeasurement)
      scrollContainer?.removeEventListener('scroll', scheduleMeasurement)
    }
  }, [editor, frameRef, scrollContainerRef])

  useEffect(() => {
    if (!activeMenu) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node

      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setActiveMenu(null)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setActiveMenu(null)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeMenu])

  useLayoutEffect(() => {
    if (!activeMenu) {
      return
    }

    function refreshMenuPosition() {
      const root = rootRef.current
      const menu = menuRef.current

      if (!root || !menu) {
        return
      }

      const viewportInset = 12
      const rootRect = root.getBoundingClientRect()
      const menuRect = menu.getBoundingClientRect()
      const left = Math.min(
        window.innerWidth - menuRect.width - viewportInset,
        Math.max(viewportInset, rootRect.right - menuRect.width),
      )
      const spaceBelow = window.innerHeight - rootRect.bottom - viewportInset
      const top =
        spaceBelow >= menuRect.height + 8
          ? rootRect.bottom + 8
          : Math.max(viewportInset, rootRect.top - menuRect.height - 8)

      setMenuPosition((current) =>
        current.left === Math.round(left) && current.top === Math.round(top)
          ? current
          : { left: Math.round(left), top: Math.round(top) },
      )
    }

    refreshMenuPosition()
    window.addEventListener('resize', refreshMenuPosition)
    window.addEventListener('scroll', refreshMenuPosition, true)

    return () => {
      window.removeEventListener('resize', refreshMenuPosition)
      window.removeEventListener('scroll', refreshMenuPosition, true)
    }
  }, [activeMenu])

  useEffect(() => {
    if (!editor) {
      return
    }

    const currentEditor = editor
    const frame = frameRef.current

    if (!frame) {
      return
    }

    function handleDragOver(event: DragEvent) {
      if (draggedSourceRef.current === null) {
        return
      }

      event.preventDefault()

      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move'
      }
    }

    /**
     * Runs in the capture phase, above ProseMirror's own drop handler.
     *
     * The grip is a plain draggable button, so this drag is one ProseMirror
     * never started: `view.dragging` is null and its handler falls back to
     * parsing the dataTransfer, which pastes the block position — a bare
     * number — into the document, and leaves the move below working from
     * positions that the insert has already shifted. Stopping the event here
     * is what keeps a block drag a block drag.
     */
    function handleDrop(event: DragEvent) {
      const sourceFrom = draggedSourceRef.current

      if (sourceFrom === null) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      draggedSourceRef.current = null

      const droppedAt = currentEditor.view.posAtCoords({
        left: event.clientX,
        top: event.clientY,
      })

      if (!droppedAt) {
        return
      }

      const targetRange = getTopLevelBlockRangeAtPosition(currentEditor, droppedAt.pos)
      const targetDom = targetRange
        ? currentEditor.view.nodeDOM(targetRange.from)
        : null
      const targetRect =
        targetDom instanceof HTMLElement ? targetDom.getBoundingClientRect() : null
      const placement =
        targetRect && event.clientY > targetRect.top + targetRect.height / 2
          ? 'after'
          : 'before'

      moveBlockToPosition(currentEditor, sourceFrom, droppedAt.pos, placement)
    }

    frame.addEventListener('dragover', handleDragOver, true)
    frame.addEventListener('drop', handleDrop, true)

    return () => {
      frame.removeEventListener('dragover', handleDragOver, true)
      frame.removeEventListener('drop', handleDrop, true)
    }
  }, [editor, frameRef])

  if (!editor) {
    return null
  }

  function runAction(action: () => boolean | void) {
    action()
    setActiveMenu(null)
  }

  const floatingMenu = activeMenu
    ? createPortal(
        <div
          className={`sn-block-handle-menu sn-block-handle-menu--floating${
            activeMenu === 'actions' ? ' sn-block-handle-menu--wide' : ''
          }`}
          ref={menuRef}
          role="menu"
          style={{ left: menuPosition.left, top: menuPosition.top }}
        >
          {activeMenu === 'insert' ? (
            <>
              {insertTargets.map((item) => (
                <button
                  key={item.target}
                  onClick={() =>
                    runAction(() => insertBlockBelow(editor, item.target))
                  }
                  type="button"
                >
                  {item.label}
                </button>
              ))}
              {onInsertImage ? (
                <button
                  key="image"
                  onClick={() => runAction(() => onInsertImage())}
                  type="button"
                >
                  Image
                </button>
              ) : null}
            </>
          ) : (
            <>
              <div className="sn-block-handle-menu__grid">
                <button
                  onClick={() => runAction(() => duplicateCurrentBlock(editor))}
                  type="button"
                >
                  <UiIcon name="copy" />
                  Duplicate
                </button>
                <button
                  onClick={() => runAction(() => deleteCurrentBlock(editor))}
                  type="button"
                >
                  <UiIcon name="trash" />
                  Delete
                </button>
                <button
                  onClick={() => runAction(() => moveCurrentBlock(editor, 'up'))}
                  type="button"
                >
                  <UiIcon name="arrowUp" />
                  {t('block.moveUp')}
                </button>
                <button
                  onClick={() => runAction(() => moveCurrentBlock(editor, 'down'))}
                  type="button"
                >
                  <UiIcon name="arrowDown" />
                  {t('block.moveDown')}
                </button>
              </div>
              <span className="sn-block-handle-menu__label">{t('block.turnInto')}</span>
              <div className="sn-block-handle-menu__turn-grid">
                {turnTargets.map((item) => (
                  <button
                    key={item.target}
                    onClick={() => runAction(() => turnInto(editor, item.target))}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>,
        document.body,
      )
    : null

  return (
    <>
      <div
        className="sn-block-handle"
        ref={rootRef}
        style={{ '--sn-block-handle-top': `${top ?? 48}px` } as CSSProperties}
      >
        <button
          aria-label={t('block.insert')}
          className="sn-block-handle__button sn-block-handle__button--insert"
          onClick={() => setActiveMenu((menu) => (menu === 'insert' ? null : 'insert'))}
          title={t('block.insert')}
          type="button"
        >
          <UiIcon name="plus" />
        </button>
        <button
          aria-label={t('block.actions')}
          className="sn-block-handle__button sn-block-handle__button--grip"
          draggable
          onClick={() => setActiveMenu((menu) => (menu === 'actions' ? null : 'actions'))}
          onDragEnd={() => {
            draggedSourceRef.current = null
          }}
          onDragStart={(event) => {
            const range = getCurrentTopLevelBlockRange(editor)

            if (!range) {
              return
            }

            draggedSourceRef.current = range.from
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', String(range.from))
          }}
          title={t('block.actions')}
          type="button"
        >
          <UiIcon name="gripVertical" />
        </button>
      </div>
      {floatingMenu}
    </>
  )
}
