import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'

const blockLayoutNodeTypes = ['paragraph', 'heading'] as const
const blockMarginValues = ['tight', 'normal', 'wide'] as const
const blockLineHeightMin = 1
const blockLineHeightMax = 3
const defaultBlockLineHeight = 1.6
const textAlignValues = ['left', 'center', 'right', 'justify'] as const
const defaultTextAlign = 'left'

export {
  blockLineHeightMax,
  blockLineHeightMin,
  blockMarginValues,
  defaultBlockLineHeight,
  defaultTextAlign,
  textAlignValues,
}

export type BlockMarginValue = (typeof blockMarginValues)[number]
export type TextAlignValue = (typeof textAlignValues)[number]

export type BlockLayoutAttrs = {
  blockLineHeight: number
  blockMargin: BlockMarginValue
  textAlign: TextAlignValue
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockLayout: {
      setBlockLineHeight: (lineHeight: number) => ReturnType
      setBlockMargin: (margin: BlockMarginValue) => ReturnType
      setBlockTextAlign: (alignment: TextAlignValue) => ReturnType
    }
  }
}

export const defaultBlockLayout: BlockLayoutAttrs = {
  blockLineHeight: defaultBlockLineHeight,
  blockMargin: 'normal',
  textAlign: defaultTextAlign,
}

function normalizeBlockMargin(value: unknown): BlockMarginValue {
  return blockMarginValues.includes(value as BlockMarginValue)
    ? (value as BlockMarginValue)
    : 'normal'
}

function normalizeBlockLineHeight(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(parsed)) {
    return defaultBlockLineHeight
  }

  return Math.round(
    Math.min(blockLineHeightMax, Math.max(blockLineHeightMin, parsed)) * 100,
  ) / 100
}

function normalizeTextAlign(value: unknown): TextAlignValue {
  return textAlignValues.includes(value as TextAlignValue)
    ? (value as TextAlignValue)
    : defaultTextAlign
}

function getNodeBlockLayout(node: ProseMirrorNode): BlockLayoutAttrs {
  return {
    blockLineHeight: normalizeBlockLineHeight(node.attrs.blockLineHeight),
    blockMargin: normalizeBlockMargin(node.attrs.blockMargin),
    textAlign: normalizeTextAlign(node.attrs.textAlign),
  }
}

function isBlockLayoutNode(node: ProseMirrorNode): boolean {
  return blockLayoutNodeTypes.includes(
    node.type.name as (typeof blockLayoutNodeTypes)[number],
  )
}

function collectSelectedBlockLayoutNodes(
  state: EditorState,
): Map<number, ProseMirrorNode> {
  const positions = new Map<number, ProseMirrorNode>()
  const { doc, selection } = state

  for (const resolvedPosition of [selection.$from, selection.$to]) {
    for (let depth = resolvedPosition.depth; depth > 0; depth -= 1) {
      const node = resolvedPosition.node(depth)

      if (isBlockLayoutNode(node)) {
        positions.set(resolvedPosition.before(depth), node)
        break
      }
    }
  }

  doc.nodesBetween(selection.from, selection.to, (node, position) => {
    if (!isBlockLayoutNode(node)) {
      return true
    }

    positions.set(position, node)
    return false
  })

  return positions
}

export function getSelectedBlockLayout(state: EditorState): BlockLayoutAttrs {
  const firstNode = collectSelectedBlockLayoutNodes(state).values().next().value

  return firstNode ? getNodeBlockLayout(firstNode) : defaultBlockLayout
}

function updateSelectedBlockLayout(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  attrs: Partial<BlockLayoutAttrs>,
): boolean {
  const nodes = collectSelectedBlockLayoutNodes(state)

  if (nodes.size === 0) {
    return false
  }

  if (dispatch) {
    const tr = state.tr

    nodes.forEach((node, position) => {
      tr.setNodeMarkup(position, undefined, {
        ...node.attrs,
        ...attrs,
      })
    })

    dispatch(tr)
  }

  return true
}

export const BlockLayout = Extension.create({
  name: 'blockLayout',

  addGlobalAttributes() {
    return [
      {
        types: [...blockLayoutNodeTypes],
        attributes: {
          blockMargin: {
            default: 'normal',
            parseHTML: (element) =>
              normalizeBlockMargin(element.getAttribute('data-block-margin')),
            renderHTML: (attributes: Partial<BlockLayoutAttrs>) => {
              const blockMargin = normalizeBlockMargin(attributes.blockMargin)

              return blockMargin !== 'normal'
                ? { 'data-block-margin': blockMargin }
                : {}
            },
          },
          blockLineHeight: {
            default: defaultBlockLineHeight,
            parseHTML: (element) =>
              normalizeBlockLineHeight(
                element.getAttribute('data-block-line-height') ||
                  element.style.lineHeight,
              ),
            renderHTML: (attributes: Partial<BlockLayoutAttrs>) => {
              const lineHeight = normalizeBlockLineHeight(attributes.blockLineHeight)

              return {
                'data-block-line-height': String(lineHeight),
                style: `line-height: ${lineHeight}`,
              }
            },
          },
          textAlign: {
            default: defaultTextAlign,
            parseHTML: (element) =>
              normalizeTextAlign(
                element.getAttribute('data-text-align') || element.style.textAlign,
              ),
            renderHTML: (attributes: Partial<BlockLayoutAttrs>) => {
              const textAlign = normalizeTextAlign(attributes.textAlign)

              return {
                'data-text-align': textAlign,
                style: `text-align: ${textAlign}`,
              }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setBlockLineHeight:
        (lineHeight) =>
        ({ dispatch, state }) =>
          updateSelectedBlockLayout(state, dispatch, {
            blockLineHeight: normalizeBlockLineHeight(lineHeight),
          }),
      setBlockMargin:
        (margin) =>
        ({ dispatch, state }) =>
          updateSelectedBlockLayout(state, dispatch, {
            blockMargin: normalizeBlockMargin(margin),
          }),
      setBlockTextAlign:
        (alignment) =>
        ({ dispatch, state }) =>
          updateSelectedBlockLayout(state, dispatch, {
            textAlign: normalizeTextAlign(alignment),
          }),
    }
  },
})
