import type { Editor, JSONContent } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Selection } from '@tiptap/pm/state'
import type { TurnIntoTarget } from '@/ui/editor/turn-into'

export type BlockMoveDirection = 'down' | 'up'
export type BlockDropPlacement = 'after' | 'before'

export type EditorBlockRange = {
  from: number
  index: number
  node: ProseMirrorNode
  to: number
}

export type InsertBlockTarget =
  | TurnIntoTarget
  | 'divider'

function emptyParagraph(): JSONContent {
  return { type: 'paragraph' }
}

function blockContentFor(target: InsertBlockTarget): JSONContent | JSONContent[] {
  switch (target) {
    case 'paragraph':
      return emptyParagraph()
    case 'heading1':
      return { type: 'heading', attrs: { level: 1 } }
    case 'heading2':
      return { type: 'heading', attrs: { level: 2 } }
    case 'heading3':
      return { type: 'heading', attrs: { level: 3 } }
    case 'bulletList':
      return {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [emptyParagraph()] }],
      }
    case 'orderedList':
      return {
        type: 'orderedList',
        content: [{ type: 'listItem', content: [emptyParagraph()] }],
      }
    case 'taskList':
      return {
        type: 'taskList',
        content: [
          {
            type: 'taskItem',
            attrs: { checked: false },
            content: [emptyParagraph()],
          },
        ],
      }
    case 'blockquote':
      return { type: 'blockquote', content: [emptyParagraph()] }
    case 'codeBlock':
      return { type: 'codeBlock' }
    case 'callout':
      return { type: 'callout', attrs: { emoji: '💡', tone: 'info' }, content: [emptyParagraph()] }
    case 'toggle':
      return {
        type: 'details',
        attrs: { open: true },
        content: [
          { type: 'detailsSummary' },
          { type: 'detailsContent', content: [emptyParagraph()] },
        ],
      }
    case 'divider':
      return [{ type: 'horizontalRule' }, emptyParagraph()]
  }
}

export function getTopLevelBlockRangeAtPosition(
  editor: Editor,
  position: number,
): EditorBlockRange | null {
  let offset = 0

  for (let index = 0; index < editor.state.doc.childCount; index += 1) {
    const node = editor.state.doc.child(index)
    const from = offset
    const to = offset + node.nodeSize

    if (position < to || index === editor.state.doc.childCount - 1) {
      return { from, index, node, to }
    }

    offset = to
  }

  return null
}

export function getCurrentTopLevelBlockRange(editor: Editor): EditorBlockRange | null {
  const { $from } = editor.state.selection

  if ($from.depth === 0) {
    return getTopLevelBlockRangeAtPosition(editor, $from.pos)
  }

  return getTopLevelBlockRangeAtPosition(editor, $from.before(1))
}

export function duplicateCurrentBlock(editor: Editor): boolean {
  const range = getCurrentTopLevelBlockRange(editor)

  if (!range) {
    return false
  }

  return editor
    .chain()
    .focus()
    .insertContentAt(range.to, range.node.toJSON())
    .setTextSelection(range.to + 1)
    .run()
}

export function deleteCurrentBlock(editor: Editor): boolean {
  const range = getCurrentTopLevelBlockRange(editor)

  if (!range) {
    return false
  }

  if (editor.state.doc.childCount <= 1) {
    return editor.chain().focus().setContent({ type: 'doc', content: [emptyParagraph()] }).run()
  }

  return editor.chain().focus().deleteRange({ from: range.from, to: range.to }).run()
}

export function insertBlockBelow(
  editor: Editor,
  target: InsertBlockTarget = 'paragraph',
): boolean {
  const range = getCurrentTopLevelBlockRange(editor)

  if (!range) {
    return false
  }

  return editor
    .chain()
    .focus()
    .insertContentAt(range.to, blockContentFor(target))
    .setTextSelection(range.to + 1)
    .run()
}

export function moveCurrentBlock(
  editor: Editor,
  direction: BlockMoveDirection,
): boolean {
  const range = getCurrentTopLevelBlockRange(editor)

  if (!range) {
    return false
  }

  const targetIndex = direction === 'up' ? range.index - 1 : range.index + 1

  if (targetIndex < 0 || targetIndex >= editor.state.doc.childCount) {
    return false
  }

  const targetRange = getTopLevelBlockRangeAtPosition(
    editor,
    direction === 'up' ? range.from - 1 : range.to + 1,
  )

  if (!targetRange) {
    return false
  }

  const slice = editor.state.doc.slice(range.from, range.to)
  const insertAt =
    direction === 'up' ? targetRange.from : targetRange.to - range.node.nodeSize
  const tr = editor.state.tr
    .delete(range.from, range.to)
    .insert(insertAt, slice.content)
  const selectionPosition = Math.min(insertAt + 1, tr.doc.content.size)

  tr.setSelection(Selection.near(tr.doc.resolve(selectionPosition)))
  tr.scrollIntoView()
  editor.view.dispatch(tr)
  editor.view.focus()
  return true
}

export function moveBlockToPosition(
  editor: Editor,
  sourceFrom: number,
  targetPosition: number,
  placement: BlockDropPlacement,
): boolean {
  const sourceRange = getTopLevelBlockRangeAtPosition(editor, sourceFrom)
  const targetRange = getTopLevelBlockRangeAtPosition(editor, targetPosition)

  if (!sourceRange || !targetRange || sourceRange.from === targetRange.from) {
    return false
  }

  const sourceSize = sourceRange.node.nodeSize
  const rawInsertAt = placement === 'before' ? targetRange.from : targetRange.to
  const insertAt = rawInsertAt > sourceRange.from ? rawInsertAt - sourceSize : rawInsertAt
  const slice = editor.state.doc.slice(sourceRange.from, sourceRange.to)
  const tr = editor.state.tr
    .delete(sourceRange.from, sourceRange.to)
    .insert(insertAt, slice.content)
  const selectionPosition = Math.min(insertAt + 1, tr.doc.content.size)

  tr.setSelection(Selection.near(tr.doc.resolve(selectionPosition)))
  tr.scrollIntoView()
  editor.view.dispatch(tr)
  editor.view.focus()
  return true
}
