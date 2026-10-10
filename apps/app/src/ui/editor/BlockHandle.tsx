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
import type { MessageKey } from '@/shared/i18n'
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

// These read shorter than the same commands in the toolbar — "Text" against
// "Paragraph", "Bullets" against "Bullet list" — because they sit in a narrow
// grid beside the caret, so they keep keys of their own rather than borrowing
// the toolbar's longer wording.
const insertTargets: Array<{ labelKey: MessageKey; target: InsertBlockTarget }> = [
  { labelKey: 'editor.paragraph', target: 'paragraph' },
  { labelKey: 'block.heading', target: 'heading2' },
  { labelKey: 'editor.todo', target: 'taskList' },
  { labelKey: 'editor.toggle', target: 'toggle' },
  { labelKey: 'editor.callout', target: 'callout' },
  { labelKey: 'block.divider', target: 'divider' },
  { labelKey: 'block.code', target: 'codeBlock' },
]

const turnTargets: Array<{ labelKey: MessageKey; target: TurnIntoTarget }> = [
  { labelKey: 'block.text', target: 'paragraph' },
  { labelKey: 'editor.heading1', target: 'heading1' },
  { labelKey: 'editor.heading2', target: 'heading2' },
  { labelKey: 'editor.heading3', target: 'heading3' },
  { labelKey: 'block.bullets', target: 'bulletList' },
  { labelKey: 'block.numbers', target: 'orderedList' },
  { labelKey: 'editor.todo', target: 'taskList' },
  { labelKey: 'block.quote', target: 'blockquote' },
  { labelKey: 'block.code', target: 'codeBlock' },
  { labelKey: 'editor.callout', target: 'callout' },
  { labelKey: 'editor.toggle', target: 'toggle' },
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
          className={`sn-block-handle-menu sn-block-handle-menu--floating sn-menu${
            activeMenu === 'actions' ? ' sn-block-handle-menu--wide' : ''
          }`}
          ref={menuRef}
          role="menu"
          style={{ left: menuPosition.left, top: menuPosition.top }}
        >
          {activeMenu === 'insert' ? (
            <>
              <span className="sn-menu__group">{t('block.insert')}</span>
              {insertTargets.map((item) => (
                <button
                  className="sn-menu-item"
                  key={item.target}
                  onClick={() =>
                    runAction(() => insertBlockBelow(editor, item.target))
                  }
                  role="menuitem"
                  type="button"
                >
                  <span className="sn-menu-item__label">{t(item.labelKey)}</span>
                </button>
              ))}
              {onInsertImage ? (
                <button
                  className="sn-menu-item"
                  key="image"
                  onClick={() => runAction(() => onInsertImage())}
                  role="menuitem"
                  type="button"
                >
                  <span className="sn-menu-item__label">{t('block.image')}</span>
                </button>
              ) : null}
            </>
          ) : (
            <>
              {/* One menu, one rule: no glyphs here, because the "turn into"
                  rows have none. Delete is last, after a separator. */}
              <button
                className="sn-menu-item"
                onClick={() => runAction(() => duplicateCurrentBlock(editor))}
                role="menuitem"
                type="button"
              >
                <span className="sn-menu-item__label">{t('block.duplicate')}</span>
              </button>
              <button
                className="sn-menu-item"
                onClick={() => runAction(() => moveCurrentBlock(editor, 'up'))}
                role="menuitem"
                type="button"
              >
                <span className="sn-menu-item__label">{t('block.moveUp')}</span>
              </button>
              <button
                className="sn-menu-item"
                onClick={() => runAction(() => moveCurrentBlock(editor, 'down'))}
                role="menuitem"
                type="button"
              >
                <span className="sn-menu-item__label">{t('block.moveDown')}</span>
              </button>
              <span className="sn-block-handle-menu__label sn-menu__group">{t('block.turnInto')}</span>
              <div className="sn-block-handle-menu__turn-grid">
                {turnTargets.map((item) => (
                  <button
                    className="sn-menu-item"
                    key={item.target}
                    onClick={() => runAction(() => turnInto(editor, item.target))}
                    role="menuitem"
                    type="button"
                  >
                    <span className="sn-menu-item__label">{t(item.labelKey)}</span>
                  </button>
                ))}
              </div>
              <div className="sn-menu__sep" role="separator" />
              <button
                className="sn-menu-item sn-menu-item--danger"
                onClick={() => runAction(() => deleteCurrentBlock(editor))}
                role="menuitem"
                type="button"
              >
                <span className="sn-menu-item__label">{t('block.delete')}</span>
              </button>
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
          className="sn-block-handle__button sn-block-handle__button--insert sn-tool"
          onClick={() => setActiveMenu((menu) => (menu === 'insert' ? null : 'insert'))}
          title={t('block.insert')}
          type="button"
        >
          <UiIcon className="sn-icon sn-icon--16" name="plus" />
        </button>
        <button
          aria-label={t('block.actions')}
          className="sn-block-handle__button sn-block-handle__button--grip sn-tool"
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
          <UiIcon className="sn-icon sn-icon--16" name="gripVertical" />
        </button>
      </div>
      {floatingMenu}
    </>
  )
}
