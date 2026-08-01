import type { Editor } from '@tiptap/core'
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  deleteCurrentBlock,
  duplicateCurrentBlock,
  getCurrentTopLevelBlockRange,
  getTopLevelBlockRangeAtPosition,
  insertBlockBelow,
  moveBlockToPosition,
  moveCurrentBlock,
  type InsertBlockTarget,
} from '@/ui/editor'
import { turnInto, type TurnIntoTarget } from '@/ui/editor/turn-into'
import { useTranslation } from '@/ui/i18n/use-translation'
import { UiIcon } from '@/ui/icons/ui/UiIcon'

type BlockHandleProps = {
  editor: Editor | null
  onInsertImage?: (() => void) | null
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

export function BlockHandle({ editor, onInsertImage = null }: BlockHandleProps) {
  const { t } = useTranslation()
  const rootRef = useRef<HTMLDivElement>(null)
  const draggedSourceRef = useRef<number | null>(null)
  const [activeMenu, setActiveMenu] = useState<HandleMenu | null>(null)
  const [top, setTop] = useState<number | null>(null)

  useEffect(() => {
    if (!editor) {
      setTop(null)
      return
    }

    const currentEditor = editor

    function refreshPosition() {
      const range = getCurrentTopLevelBlockRange(currentEditor)
      const frame = currentEditor.view.dom.closest('.sn-page-layout-frame')

      if (!range || !(frame instanceof HTMLElement)) {
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

    refreshPosition()
    currentEditor.on('selectionUpdate', refreshPosition)
    currentEditor.on('update', refreshPosition)
    currentEditor.on('focus', refreshPosition)
    window.addEventListener('resize', refreshPosition)
    const scrollContainer = currentEditor.view.dom.closest('.sn-editor-panel')
    scrollContainer?.addEventListener('scroll', refreshPosition, { passive: true })

    return () => {
      currentEditor.off('selectionUpdate', refreshPosition)
      currentEditor.off('update', refreshPosition)
      currentEditor.off('focus', refreshPosition)
      window.removeEventListener('resize', refreshPosition)
      scrollContainer?.removeEventListener('scroll', refreshPosition)
    }
  }, [editor])

  useEffect(() => {
    if (!activeMenu) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
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

  useEffect(() => {
    if (!editor) {
      return
    }

    const currentEditor = editor
    const frame = currentEditor.view.dom.closest('.sn-page-layout-frame')

    if (!(frame instanceof HTMLElement)) {
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

    function handleDrop(event: DragEvent) {
      const sourceFrom = draggedSourceRef.current

      if (sourceFrom === null) {
        return
      }

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

      event.preventDefault()
      moveBlockToPosition(currentEditor, sourceFrom, droppedAt.pos, placement)
      draggedSourceRef.current = null
    }

    frame.addEventListener('dragover', handleDragOver)
    frame.addEventListener('drop', handleDrop)

    return () => {
      frame.removeEventListener('dragover', handleDragOver)
      frame.removeEventListener('drop', handleDrop)
    }
  }, [editor])

  if (!editor) {
    return null
  }

  function runAction(action: () => boolean | void) {
    action()
    setActiveMenu(null)
  }

  return (
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

      {activeMenu === 'insert' ? (
        <div className="sn-block-handle-menu" role="menu">
          {insertTargets.map((item) => (
            <button
              key={item.target}
              onClick={() => runAction(() => insertBlockBelow(editor, item.target))}
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
        </div>
      ) : null}

      {activeMenu === 'actions' ? (
        <div className="sn-block-handle-menu sn-block-handle-menu--wide" role="menu">
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
            <button onClick={() => runAction(() => moveCurrentBlock(editor, 'up'))} type="button">
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
        </div>
      ) : null}
    </div>
  )
}
