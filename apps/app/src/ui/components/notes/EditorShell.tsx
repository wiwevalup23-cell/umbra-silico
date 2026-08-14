import { Extension } from '@tiptap/core'
import { Mathematics } from '@tiptap/extension-mathematics'
import { TableKit } from '@tiptap/extension-table'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import katex from 'katex'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  documentNodeSchema,
  parseNoteDocument,
  type NoteDocument,
} from '@/shared/contracts/document'
import type { ImageSourceResolver } from '@/shared/contracts/image'
import type {
  NoteDetail,
  NoteId,
  PlaintextLocalNote,
} from '@/shared/contracts/note'
import {
  Callout,
  createDebouncedAutosave,
  editorFontOptions,
  editorHighlightOptions,
  editorTextSizeOptions,
  getCurrentTopLevelBlockRange,
  ImageBlock,
  ImageSourceContext,
  NoteTextStyleExtensions,
  TaskListExtensions,
  ToggleExtensions,
  turnInto,
} from '@/ui/editor'
import { BlockHandle } from '@/ui/components/notes/BlockHandle'
import { EmptyStatePlayer } from '@/ui/components/notes/EmptyStatePlayer'
import { SquircleButton } from '@/ui/components/silicon/SquircleButton'
import { CompassIcon } from '@/ui/icons/compass/CompassIcon'
import { exportNoteToPdf } from '@/ui/export-note-pdf'
import { UiIcon } from '@/ui/icons/ui/UiIcon'
import { LegacyUiIcon } from '@/ui/icons/ui/LegacyUiIcon'
import { useTranslation } from '@/ui/i18n/use-translation'
import {
  getLocalSavePresentation,
  getPersistencePresentation,
} from '@/ui/note-presentation'

// Structural mirror of the repository's ImportedImage: UI stays decoupled
// from the repository layer.
export type ImportedImageInfo = {
  imageId: string
  width: number
  height: number
}

export type ImportImageHandler = (
  noteId: NoteId,
  file: File,
) => Promise<ImportedImageInfo>

export type EditorShellApi = {
  revealImage(imageId: string): void
}

type EditorShellProps = {
  hasRemote?: boolean
  note: NoteDetail | null
  onChangeDocument: (noteId: NoteId, document: NoteDocument) => Promise<void>
  onChangeTitle: (noteId: NoteId, title: string) => Promise<void>
  onCreateNote: () => void
  isCreatingNote?: boolean
  onBrowseTemplates?: () => void
  pendingOperations: number
  syncStatus: string
  editorApiRef?: { current: EditorShellApi | null }
  imageResolver?: ImageSourceResolver | null
  onImportImage?: ImportImageHandler | null
}

type AutosaveState = 'saved' | 'queued' | 'saving' | 'error'

type DocumentAutosavePayload = {
  document: NoteDocument
  noteId: NoteId
}

type TitleAutosavePayload = {
  noteId: NoteId
  title: string
}

function normalizeTitle(title: string): string {
  return title.trim() || 'Untitled'
}

function normalizeEditorContent(document: NoteDocument) {
  const content = document.content.content?.length
    ? document.content
    : {
        ...document.content,
        content: [{ type: 'paragraph' }],
      }

  return documentNodeSchema.parse(content)
}

function createDocumentFromEditorJson(content: unknown): NoteDocument {
  return parseNoteDocument({
    schemaVersion: 1,
    editor: 'tiptap',
    content,
  })
}

function isSameContent(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

type EditorToolbarProps = {
  editor: ReturnType<typeof useEditor> | null
  onInsertImage?: (() => void) | null
  onOpenMath: (kind: MathKind) => void
}

type MathKind = 'inline' | 'block'

type MathEditorDraft = {
  kind: MathKind
  latex: string
  mode: 'insert' | 'edit'
  pos: number | null
}

const blockIndentMin = 0
const blockIndentMax = 6
const blockLayoutNodeTypes = ['paragraph', 'heading'] as const
const blockMarginValues = ['tight', 'normal', 'wide'] as const
const blockLineHeightMin = 1
const blockLineHeightMax = 3
const defaultBlockLineHeight = 1.6
const textAlignValues = ['left', 'center', 'right', 'justify'] as const
const defaultTextAlign = 'left'
const pageOffsetMin = 8
const pageOffsetMax = 132
/* The page "margins" are really the measure: what makes a document readable is
   how many characters land on a line, not how many pixels sit beside them. A
   pixel gap keeps the same size while the column behind it grows with the
   window, so the line quietly runs past the point the eye can track. Stored in
   `ch` — the width of "0" in the body face — so it follows the type size. */
const pageMeasureMin = 40
const pageMeasureMax = 100
const defaultPageMeasure = 66
const defaultPageHeaderOffset = 48
/* Deliberately larger than the top: a page with equal top and bottom reads as
   sagging, because the optical centre sits above the geometric one. */
const defaultPageFooterOffset = 96

type BlockMarginValue = (typeof blockMarginValues)[number]
type TextAlignValue = (typeof textAlignValues)[number]

type BlockLayoutAttrs = {
  blockIndent: number
  blockLineHeight: number
  blockMargin: BlockMarginValue
  textAlign: TextAlignValue
}

type PageLayoutAttrs = {
  pageFooterOffset: number
  pageHeaderOffset: number
  pageMeasure: number
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockLayout: {
      decreaseBlockIndent: () => ReturnType
      increaseBlockIndent: () => ReturnType
      setBlockIndent: (level: number) => ReturnType
      setBlockLineHeight: (lineHeight: number) => ReturnType
      setBlockMargin: (margin: BlockMarginValue) => ReturnType
      setBlockTextAlign: (alignment: TextAlignValue) => ReturnType
    }
    pageLayout: {
      adjustPageFooterOffset: (delta: number) => ReturnType
      adjustPageHeaderOffset: (delta: number) => ReturnType
      setPageFooterOffset: (offset: number) => ReturnType
      setPageHeaderOffset: (offset: number) => ReturnType
      setPageMeasure: (margin: number) => ReturnType
    }
  }
}

function clampBlockIndent(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(parsed)) {
    return blockIndentMin
  }

  return Math.min(blockIndentMax, Math.max(blockIndentMin, Math.round(parsed)))
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

function clampPageOffset(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(parsed)) {
    return pageOffsetMin
  }

  return Math.min(pageOffsetMax, Math.max(pageOffsetMin, Math.round(parsed)))
}

function clampPageMeasure(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(parsed)) {
    return defaultPageMeasure
  }

  return Math.min(
    pageMeasureMax,
    Math.max(pageMeasureMin, Math.round(parsed)),
  )
}

function getPageLayout(state: EditorState): PageLayoutAttrs {
  return {
    pageFooterOffset: clampPageOffset(
      state.doc.attrs.pageFooterOffset ?? defaultPageFooterOffset,
    ),
    pageHeaderOffset: clampPageOffset(
      state.doc.attrs.pageHeaderOffset ?? defaultPageHeaderOffset,
    ),
    pageMeasure: clampPageMeasure(
      state.doc.attrs.pageMeasure ?? defaultPageMeasure,
    ),
  }
}

function getNodeBlockLayout(node: ProseMirrorNode): BlockLayoutAttrs {
  return {
    blockIndent: clampBlockIndent(node.attrs.blockIndent),
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

function getSelectedBlockLayout(state: EditorState): BlockLayoutAttrs {
  const firstNode = collectSelectedBlockLayoutNodes(state).values().next().value

  return firstNode
    ? getNodeBlockLayout(firstNode)
    : {
        blockIndent: blockIndentMin,
        blockLineHeight: defaultBlockLineHeight,
        blockMargin: 'normal',
        textAlign: defaultTextAlign,
      }
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

const BlockLayout = Extension.create({
  name: 'blockLayout',

  addGlobalAttributes() {
    return [
      {
        types: [...blockLayoutNodeTypes],
        attributes: {
          blockIndent: {
            default: blockIndentMin,
            parseHTML: (element) =>
              clampBlockIndent(element.getAttribute('data-block-indent')),
            renderHTML: (attributes: Partial<BlockLayoutAttrs>) => {
              const blockIndent = clampBlockIndent(attributes.blockIndent)

              return blockIndent > blockIndentMin
                ? { 'data-block-indent': String(blockIndent) }
                : {}
            },
          },
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
      decreaseBlockIndent:
        () =>
        ({ dispatch, state }) => {
          const currentLayout = getSelectedBlockLayout(state)

          return updateSelectedBlockLayout(state, dispatch, {
            blockIndent: clampBlockIndent(currentLayout.blockIndent - 1),
          })
        },
      increaseBlockIndent:
        () =>
        ({ dispatch, state }) => {
          const currentLayout = getSelectedBlockLayout(state)

          return updateSelectedBlockLayout(state, dispatch, {
            blockIndent: clampBlockIndent(currentLayout.blockIndent + 1),
          })
        },
      setBlockIndent:
        (level) =>
        ({ dispatch, state }) =>
          updateSelectedBlockLayout(state, dispatch, {
            blockIndent: clampBlockIndent(level),
          }),
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

const PageLayout = Extension.create({
  name: 'pageLayout',

  addGlobalAttributes() {
    return [
      {
        types: ['doc'],
        attributes: {
          pageFooterOffset: {
            default: defaultPageFooterOffset,
          },
          pageHeaderOffset: {
            default: defaultPageHeaderOffset,
          },
          pageMeasure: {
            default: defaultPageMeasure,
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      adjustPageFooterOffset:
        (delta) =>
        ({ dispatch, state }) => {
          const currentLayout = getPageLayout(state)

          if (dispatch) {
            dispatch(
              state.tr.setDocAttribute(
                'pageFooterOffset',
                clampPageOffset(currentLayout.pageFooterOffset + delta),
              ),
            )
          }

          return true
        },
      adjustPageHeaderOffset:
        (delta) =>
        ({ dispatch, state }) => {
          const currentLayout = getPageLayout(state)

          if (dispatch) {
            dispatch(
              state.tr.setDocAttribute(
                'pageHeaderOffset',
                clampPageOffset(currentLayout.pageHeaderOffset + delta),
              ),
            )
          }

          return true
        },
      setPageFooterOffset:
        (offset) =>
        ({ dispatch, state }) => {
          if (dispatch) {
            dispatch(
              state.tr.setDocAttribute('pageFooterOffset', clampPageOffset(offset)),
            )
          }

          return true
        },
      setPageHeaderOffset:
        (offset) =>
        ({ dispatch, state }) => {
          if (dispatch) {
            dispatch(
              state.tr.setDocAttribute('pageHeaderOffset', clampPageOffset(offset)),
            )
          }

          return true
        },
      setPageMeasure:
        (margin) =>
        ({ dispatch, state }) => {
          if (dispatch) {
            dispatch(
              state.tr.setDocAttribute(
                'pageMeasure',
                clampPageMeasure(margin),
              ),
            )
          }

          return true
        },
    }
  },
})

/**
 * `codeBlock`'s own exits (Tab-indentation stays inside it, Mod-Enter and an
 * ArrowDown at the last line both call `exitCode` already, via core's base
 * keymap and the extension's own shortcuts) still leave no plain, position-
 * independent way out. Without one, a code block is a keyboard trap — WCAG
 * 2.1.2 — so Escape gets the same `exitCode` exit as Mod-Enter.
 */
const CodeBlockEscapeExit = Extension.create({
  name: 'codeBlockEscapeExit',

  addKeyboardShortcuts() {
    return {
      Escape: () => {
        if (this.editor.state.selection.$from.parent.type.name !== 'codeBlock') {
          return false
        }

        return this.editor.commands.exitCode()
      },
    }
  },
})

type ToolbarButtonProps = {
  children: ReactNode
  disabled?: boolean
  label: string
  onPress: () => void
  pressed?: boolean
}

function ToolbarButton({
  children,
  disabled = false,
  label,
  onPress,
  pressed = false,
}: ToolbarButtonProps) {
  return (
    <button
      aria-label={label}
      className="sn-editor-tool"
      data-active={pressed}
      disabled={disabled}
      onClick={onPress}
      title={label}
      type="button"
    >
      {children}
    </button>
  )
}

type MenuButtonProps = Omit<ToolbarButtonProps, 'children'> & {
  icon: ReactNode
}

/**
 * A row in the "more tools" menu: mark, then name.
 *
 * The visible name is the same translated string the button announces, which
 * is what keeps the menu in the user's language — it used to render hardcoded
 * English children beside a translated `aria-label`.
 */
function MenuButton({ disabled = false, icon, label, onPress, pressed = false }: MenuButtonProps) {
  return (
    <button
      aria-label={label}
      className="sn-editor-menu-button"
      data-active={pressed}
      disabled={disabled}
      onClick={onPress}
      title={label}
      type="button"
    >
      <span aria-hidden="true" className="sn-editor-menu-button__icon">{icon}</span>
      <span className="sn-editor-menu-button__label">{label}</span>
    </button>
  )
}

type LayoutNumberFieldProps = {
  disabled?: boolean
  label: string
  max: number
  min: number
  onCommit: (value: number) => void
  step?: number
  unit: string
  value: number
}

function LayoutNumberField({
  disabled = false,
  label,
  max,
  min,
  onCommit,
  step = 1,
  unit,
  value,
}: LayoutNumberFieldProps) {
  return (
    <label className="sn-editor-page-settings__field">
      <span className="sn-editor-page-settings__name">{label}</span>
      <input
        aria-label={label}
        className="sn-editor-tools-menu__number"
        defaultValue={value}
        disabled={disabled}
        key={value}
        max={max}
        min={min}
        onBlur={(event) => onCommit(event.currentTarget.valueAsNumber)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          }
        }}
        step={step}
        type="number"
      />
      <span className="sn-editor-page-settings__unit">{unit}</span>
    </label>
  )
}

function TextAlignmentGlyph({ alignment }: { alignment: TextAlignValue }) {
  return (
    <span
      aria-hidden="true"
      className="sn-text-alignment-glyph"
      data-alignment={alignment}
    >
      <i />
      <i />
      <i />
    </span>
  )
}

function EditorToolbar({
  editor,
  onInsertImage = null,
  onOpenMath,
}: EditorToolbarProps) {
  const { t } = useTranslation()
  const [isHighlightMenuOpen, setIsHighlightMenuOpen] = useState(false)
  // One "more tools" drawer held every aspect at once, so finding a table
  // command meant reading past the block ones. Each aspect gets its own panel.
  const [openPanel, setOpenPanel] = useState<'blocks' | 'table' | null>(null)
  const highlightMenuRef = useRef<HTMLDivElement>(null)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const toolsMenuRef = useRef<HTMLDivElement>(null)
  const [toolsMenuStyle, setToolsMenuStyle] = useState<CSSProperties | null>(null)
  const state = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      blockLayout: currentEditor
        ? getSelectedBlockLayout(currentEditor.state)
        : {
            blockIndent: blockIndentMin,
            blockLineHeight: defaultBlockLineHeight,
            blockMargin: 'normal' as const,
            textAlign: defaultTextAlign as TextAlignValue,
          },
      canAddTableColumn: currentEditor?.can().addColumnAfter() ?? false,
      canAddTableRow: currentEditor?.can().addRowAfter() ?? false,
      canDeleteTable: currentEditor?.can().deleteTable() ?? false,
      canDeleteTableColumn: currentEditor?.can().deleteColumn() ?? false,
      canDeleteTableRow: currentEditor?.can().deleteRow() ?? false,
      canMergeCells: currentEditor?.can().mergeCells() ?? false,
      canSplitCell: currentEditor?.can().splitCell() ?? false,
      pageLayout: currentEditor
        ? getPageLayout(currentEditor.state)
        : {
            pageFooterOffset: defaultPageFooterOffset,
            pageHeaderOffset: defaultPageHeaderOffset,
            pageMeasure: defaultPageMeasure,
          },
      canRedo: currentEditor?.can().redo() ?? false,
      canUndo: currentEditor?.can().undo() ?? false,
      fontFamily: (currentEditor?.getAttributes('textStyle').fontFamily as string | undefined) ?? '',
      fontSize: (currentEditor?.getAttributes('textStyle').fontSize as string | undefined) ?? '',
      highlightColor:
        (currentEditor?.getAttributes('highlight').color as string | undefined) ?? '',
      isBlockquote: currentEditor?.isActive('blockquote') ?? false,
      isBold: currentEditor?.isActive('bold') ?? false,
      isBulletList: currentEditor?.isActive('bulletList') ?? false,
      isCallout: currentEditor?.isActive('callout') ?? false,
      isCode: currentEditor?.isActive('code') ?? false,
      isCodeBlock: currentEditor?.isActive('codeBlock') ?? false,
      isDetails: currentEditor?.isActive('details') ?? false,
      isHeading1: currentEditor?.isActive('heading', { level: 1 }) ?? false,
      isHeading2: currentEditor?.isActive('heading', { level: 2 }) ?? false,
      isItalic: currentEditor?.isActive('italic') ?? false,
      isOrderedList: currentEditor?.isActive('orderedList') ?? false,
      isStrike: currentEditor?.isActive('strike') ?? false,
      isTable: currentEditor?.isActive('table') ?? false,
      isTaskList: currentEditor?.isActive('taskList') ?? false,
    }),
  })
  const toolbarState = state ?? {
    blockLayout: {
      blockIndent: blockIndentMin,
      blockLineHeight: defaultBlockLineHeight,
      blockMargin: 'normal' as const,
      textAlign: defaultTextAlign as TextAlignValue,
    },
    canAddTableColumn: false,
    canAddTableRow: false,
    canDeleteTable: false,
    canDeleteTableColumn: false,
    canDeleteTableRow: false,
    canMergeCells: false,
    canSplitCell: false,
    pageLayout: {
      pageFooterOffset: defaultPageFooterOffset,
      pageHeaderOffset: defaultPageHeaderOffset,
      pageMeasure: defaultPageMeasure,
    },
    canRedo: false,
    canUndo: false,
    fontFamily: '',
    fontSize: '',
    highlightColor: '',
    isBlockquote: false,
    isBold: false,
    isBulletList: false,
    isCallout: false,
    isCode: false,
    isCodeBlock: false,
    isDetails: false,
    isHeading1: false,
    isHeading2: false,
    isItalic: false,
    isOrderedList: false,
    isStrike: false,
    isTable: false,
    isTaskList: false,
  }

  useEffect(() => {
    if (!isHighlightMenuOpen && !openPanel) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      if (!highlightMenuRef.current?.contains(event.target as Node)) {
        setIsHighlightMenuOpen(false)
      }

      if (
        !moreMenuRef.current?.contains(event.target as Node) &&
        !toolsMenuRef.current?.contains(event.target as Node)
      ) {
        setOpenPanel(null)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsHighlightMenuOpen(false)
        setOpenPanel(null)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isHighlightMenuOpen, openPanel])

  useLayoutEffect(() => {
    if (!openPanel) {
      setToolsMenuStyle(null)
      return
    }

    function placeToolsMenu() {
      const anchor = moreMenuRef.current
      const menu = toolsMenuRef.current

      if (!anchor) {
        return
      }

      const toolbar = anchor.closest('.sn-editor-toolbar')
      const anchorRect = anchor.getBoundingClientRect()
      const toolbarRect = toolbar?.getBoundingClientRect() ?? anchorRect
      const viewportMargin = 12
      const menuWidth = Math.min(440, window.innerWidth - viewportMargin * 2)
      const left = Math.min(
        window.innerWidth - menuWidth - viewportMargin,
        Math.max(viewportMargin, anchorRect.right - menuWidth),
      )
      const maxHeight = Math.min(680, window.innerHeight * 0.72)
      const measuredHeight = Math.min(menu?.scrollHeight ?? maxHeight, maxHeight)
      const spaceBelow = window.innerHeight - toolbarRect.bottom - viewportMargin - 8
      const openAbove = spaceBelow < Math.min(measuredHeight, 280) && toolbarRect.top > spaceBelow
      const top = openAbove
        ? Math.max(viewportMargin, toolbarRect.top - measuredHeight - 8)
        : toolbarRect.bottom + 8

      setToolsMenuStyle({
        left,
        maxHeight: openAbove
          ? Math.min(maxHeight, toolbarRect.top - viewportMargin - 8)
          : Math.min(maxHeight, window.innerHeight - top - viewportMargin),
        top,
        visibility: 'visible',
        width: menuWidth,
      })
    }

    placeToolsMenu()
    window.addEventListener('resize', placeToolsMenu)
    document.addEventListener('scroll', placeToolsMenu, true)

    return () => {
      window.removeEventListener('resize', placeToolsMenu)
      document.removeEventListener('scroll', placeToolsMenu, true)
    }
  }, [openPanel])

  function runCommand(command: () => void) {
    command()
  }

  const selectedFontFamily = editorFontOptions.some(
    (option) => option.value === toolbarState.fontFamily,
  )
    ? toolbarState.fontFamily
    : ''
  const selectedFontSize = editorTextSizeOptions.some(
    (option) => option.value === toolbarState.fontSize,
  )
    ? toolbarState.fontSize
    : ''

  return (
    <div className="sn-editor-toolbar" aria-label={t('editor.toolbar')} role="toolbar">
      <div
        aria-label={t('editor.groupTypography')}
        className="sn-editor-toolbar__group sn-editor-toolbar__group--typography"
        role="group"
      >
        <label className="sn-editor-format-field">
          <span aria-hidden="true" className="sn-editor-format-field__prefix">Aa</span>
          <span className="sn-sr-only">{t('editor.fontFamily')}</span>
          <select
            aria-label={t('editor.fontFamily')}
            disabled={!editor}
            onChange={(event) => {
              const fontFamily = event.target.value
              runCommand(() => {
                if (!editor) return
                const chain = editor.chain().focus()
                if (fontFamily) chain.setFontFamily(fontFamily).run()
                else chain.unsetFontFamily().run()
              })
            }}
            style={{ fontFamily: selectedFontFamily || undefined }}
            value={selectedFontFamily}
          >
            {editorFontOptions.map((option) => (
              <option key={option.label} value={option.value}>
                {/* Typeface names are proper nouns; only "no choice" is copy. */}
                {option.value === '' ? t('editor.fontDefault') : option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="sn-editor-format-field sn-editor-format-field--size">
          <span className="sn-sr-only">{t('editor.fontSize')}</span>
          <select
            aria-label={t('editor.fontSize')}
            disabled={!editor}
            onChange={(event) => {
              const fontSize = event.target.value
              runCommand(() => {
                if (!editor) return
                const chain = editor.chain().focus()
                if (fontSize) chain.setFontSize(fontSize).run()
                else chain.unsetFontSize().run()
              })
            }}
            value={selectedFontSize}
          >
            {editorTextSizeOptions.map((option) => (
              <option key={option.label} value={option.value}>
                {option.value === '' ? t('editor.fontAuto') : option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <span className="sn-editor-toolbar__divider" aria-hidden="true" />

      <div className="sn-editor-toolbar__group" aria-label={t('editor.groupFormatting')} role="group">
        <ToolbarButton
          disabled={!editor}
          label={t('editor.bold')}
          onPress={() => {
            runCommand(() => editor?.chain().focus().toggleBold().run())
          }}
          pressed={toolbarState.isBold}
        >
          <CompassIcon name="bold" />
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor}
          label={t('editor.italic')}
          onPress={() => {
            runCommand(() => editor?.chain().focus().toggleItalic().run())
          }}
          pressed={toolbarState.isItalic}
        >
          <CompassIcon name="italic" />
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor}
          label={t('editor.strike')}
          onPress={() => {
            runCommand(() => editor?.chain().focus().toggleStrike().run())
          }}
          pressed={toolbarState.isStrike}
        >
          <CompassIcon name="strikethrough" />
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor}
          label={t('editor.inlineCode')}
          onPress={() => {
            runCommand(() => editor?.chain().focus().toggleCode().run())
          }}
          pressed={toolbarState.isCode}
        >
          <CompassIcon name="code" />
        </ToolbarButton>
        <div className="sn-editor-highlight-control" ref={highlightMenuRef}>
          <ToolbarButton
            disabled={!editor}
            label={t('editor.markerColor')}
            onPress={() => {
              setIsHighlightMenuOpen((isOpen) => !isOpen)
              setOpenPanel(null)
            }}
            pressed={Boolean(toolbarState.highlightColor)}
          >
            <span
              aria-hidden="true"
              className="sn-editor-highlight-symbol"
              style={
                {
                  '--sn-editor-highlight': toolbarState.highlightColor || '#f3df84',
                } as CSSProperties
              }
            >
              A
            </span>
          </ToolbarButton>
          {isHighlightMenuOpen ? (
            <div
              aria-label={t('editor.markerColors')}
              className="sn-editor-highlight-menu"
              role="menu"
            >
              <span className="sn-editor-highlight-menu__label">Marker</span>
              <div className="sn-editor-highlight-menu__swatches">
                {editorHighlightOptions.map((option) => (
                  <button
                    aria-label={option.label}
                    className="sn-editor-highlight-swatch"
                    data-active={toolbarState.highlightColor === option.color}
                    key={option.color}
                    onClick={() => {
                      editor?.chain().focus().setHighlight({ color: option.color }).run()
                      setIsHighlightMenuOpen(false)
                    }}
                    style={{ backgroundColor: option.color }}
                    title={option.label}
                    type="button"
                  />
                ))}
              </div>
              <button
                className="sn-editor-highlight-menu__clear"
                disabled={!toolbarState.highlightColor}
                onClick={() => {
                  editor?.chain().focus().unsetHighlight().run()
                  setIsHighlightMenuOpen(false)
                }}
                type="button"
              >
                Clear marker
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <span className="sn-editor-toolbar__divider" aria-hidden="true" />

      <div className="sn-editor-toolbar__group" aria-label={t('editor.groupStructure')} role="group">
        <ToolbarButton
          disabled={!editor}
          label={t('editor.heading1')}
          onPress={() => {
            runCommand(() => editor?.chain().focus().toggleHeading({ level: 1 }).run())
          }}
          pressed={toolbarState.isHeading1}
        >
          <CompassIcon name="heading1" />
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor}
          label={t('editor.heading2')}
          onPress={() => {
            runCommand(() => editor?.chain().focus().toggleHeading({ level: 2 }).run())
          }}
          pressed={toolbarState.isHeading2}
        >
          <CompassIcon name="heading2" />
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor}
          label={t('editor.blockquote')}
          onPress={() => {
            runCommand(() => editor?.chain().focus().toggleBlockquote().run())
          }}
          pressed={toolbarState.isBlockquote}
        >
          <CompassIcon name="quote" />
        </ToolbarButton>
        {onInsertImage ? (
          <ToolbarButton
            disabled={!editor}
            label={t('editor.insertImage')}
            onPress={() => {
              runCommand(() => onInsertImage())
            }}
          >
            <CompassIcon name="image" />
          </ToolbarButton>
        ) : null}
        <ToolbarButton
          disabled={!editor}
          label={t('editor.insertEquation')}
          onPress={() => onOpenMath('block')}
        >
          <span aria-hidden="true" className="sn-editor-tool-label sn-editor-tool-label--math">
            ∑
          </span>
        </ToolbarButton>
      </div>
      <span className="sn-editor-toolbar__divider" aria-hidden="true" />

      <div className="sn-editor-toolbar__group" aria-label={t('editor.groupLists')} role="group">
        <ToolbarButton
          disabled={!editor}
          label={t('editor.bulletList')}
          onPress={() => {
            runCommand(() => editor?.chain().focus().toggleBulletList().run())
          }}
          pressed={toolbarState.isBulletList}
        >
          <CompassIcon name="bulletList" />
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor}
          label={t('editor.orderedList')}
          onPress={() => {
            runCommand(() => editor?.chain().focus().toggleOrderedList().run())
          }}
          pressed={toolbarState.isOrderedList}
        >
          <CompassIcon name="numberedList" />
        </ToolbarButton>
      </div>
      <span className="sn-editor-toolbar__divider" aria-hidden="true" />

      <div
        className="sn-editor-toolbar__group sn-editor-toolbar__group--more"
        ref={moreMenuRef}
      >
        <ToolbarButton
          disabled={!editor}
          label={t('editor.blocksPanel')}
          onPress={() => {
            setOpenPanel((current) => (current === 'blocks' ? null : 'blocks'))
            setIsHighlightMenuOpen(false)
          }}
          pressed={openPanel === 'blocks'}
        >
          <CompassIcon name="callout" />
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor}
          label={t('editor.tablePanel')}
          onPress={() => {
            setOpenPanel((current) => (current === 'table' ? null : 'table'))
            setIsHighlightMenuOpen(false)
          }}
          pressed={openPanel === 'table'}
        >
          <CompassIcon name="table" />
        </ToolbarButton>

        {openPanel === 'blocks' ? createPortal(
          <div
            aria-label={t('editor.blocksPanel')}
            className="sn-editor-tools-menu sn-editor-tools-menu--blocks sn-editor-tools-menu--floating"
            ref={toolsMenuRef}
            role="dialog"
            style={toolsMenuStyle ?? { visibility: 'hidden' }}
          >
            <div className="sn-editor-tools-menu__section" role="group">
              <span className="sn-editor-tools-menu__label">{t('editor.groupLayout')}</span>
              <div className="sn-editor-tools-menu__row sn-editor-tools-menu__row--alignment">
                {textAlignValues.map((alignment) => (
                  <MenuButton
                    disabled={!editor}
                    icon={<TextAlignmentGlyph alignment={alignment} />}
                    key={alignment}
                    label={t(`editor.align${alignment[0].toUpperCase()}${alignment.slice(1)}` as 'editor.alignLeft')}
                    onPress={() => {
                      editor?.commands.setBlockTextAlign(alignment)
                    }}
                    pressed={toolbarState.blockLayout.textAlign === alignment}
                  />
                ))}
              </div>
            </div>

            <div className="sn-editor-tools-menu__section" role="group">
              <span className="sn-editor-tools-menu__label">{t('editor.lineSpacing')}</span>
              <div className="sn-editor-layout-presets">
                {/* Even 0.2 steps. The old ladder wasted a slot on 1.45 and
                    1.5 — three per cent apart, indistinguishable — and offered
                    1.0, at which body lines touch. */}
                {[1.2, 1.4, 1.6, 1.8, 2].map((lineHeight) => (
                  <button
                    className="sn-editor-layout-preset"
                    data-active={toolbarState.blockLayout.blockLineHeight === lineHeight}
                    disabled={!editor}
                    key={lineHeight}
                    onClick={() => editor?.commands.setBlockLineHeight(lineHeight)}
                    type="button"
                  >
                    {lineHeight}
                  </button>
                ))}
              </div>
              <LayoutNumberField
                disabled={!editor}
                label={t('editor.customValue')}
                max={blockLineHeightMax}
                min={blockLineHeightMin}
                onCommit={(value) => editor?.commands.setBlockLineHeight(value)}
                step={0.05}
                unit="×"
                value={toolbarState.blockLayout.blockLineHeight}
              />
            </div>

            <div className="sn-editor-tools-menu__section" role="group">
              <span className="sn-editor-tools-menu__label">{t('editor.paragraphSpacing')}</span>
              <div className="sn-editor-layout-presets">
                {blockMarginValues.map((margin) => (
                  <button
                    className="sn-editor-layout-preset"
                    data-active={toolbarState.blockLayout.blockMargin === margin}
                    disabled={!editor}
                    key={margin}
                    onClick={() => editor?.commands.setBlockMargin(margin)}
                    type="button"
                  >
                    {t(`editor.spacing${margin[0].toUpperCase()}${margin.slice(1)}` as 'editor.spacingTight')}
                  </button>
                ))}
              </div>
            </div>

            <div className="sn-editor-tools-menu__section" role="group">
              <span className="sn-editor-tools-menu__label">{t('editor.pageMargins')}</span>
              <div className="sn-editor-layout-presets">
                {/* Wider margins mean a shorter line, so the presets run the
                    measure the other way: 74 characters with the text nearly
                    filling the sheet, 60 with a broad margin either side. */}
                {([
                  ['editor.marginNarrow', 74, 40, 80],
                  ['editor.marginNormal', defaultPageMeasure, defaultPageHeaderOffset, defaultPageFooterOffset],
                  ['editor.marginWide', 60, 56, 112],
                ] as const).map(([labelKey, measure, top, bottom]) => (
                  <button
                    className="sn-editor-layout-preset"
                    data-active={
                      toolbarState.pageLayout.pageMeasure === measure &&
                      toolbarState.pageLayout.pageHeaderOffset === top &&
                      toolbarState.pageLayout.pageFooterOffset === bottom
                    }
                    disabled={!editor}
                    key={labelKey}
                    onClick={() => {
                      editor?.commands.setPageMeasure(measure)
                      editor?.commands.setPageHeaderOffset(top)
                      editor?.commands.setPageFooterOffset(bottom)
                    }}
                    type="button"
                  >
                    {t(labelKey)}
                  </button>
                ))}
              </div>
              <div className="sn-editor-page-settings">
                <LayoutNumberField
                  disabled={!editor}
                  label={t('editor.measure')}
                  max={pageMeasureMax}
                  min={pageMeasureMin}
                  onCommit={(value) => editor?.commands.setPageMeasure(value)}
                  unit={t('editor.characters')}
                  value={toolbarState.pageLayout.pageMeasure}
                />
                <LayoutNumberField
                  disabled={!editor}
                  label={t('editor.marginTop')}
                  max={pageOffsetMax}
                  min={pageOffsetMin}
                  onCommit={(value) => editor?.commands.setPageHeaderOffset(value)}
                  unit={t('editor.pixels')}
                  value={toolbarState.pageLayout.pageHeaderOffset}
                />
                <LayoutNumberField
                  disabled={!editor}
                  label={t('editor.marginBottom')}
                  max={pageOffsetMax}
                  min={pageOffsetMin}
                  onCommit={(value) => editor?.commands.setPageFooterOffset(value)}
                  unit={t('editor.pixels')}
                  value={toolbarState.pageLayout.pageFooterOffset}
                />
              </div>
            </div>

            <div className="sn-editor-tools-menu__section" role="group">
              <span className="sn-editor-tools-menu__label">{t('editor.groupText')}</span>
              <div className="sn-editor-tools-menu__row">
                <MenuButton
                  disabled={!editor}
                  icon={<CompassIcon name="quote" />}
                  label={t('editor.paragraph')}
                  onPress={() => { if (editor) turnInto(editor, 'paragraph') }}
                />
                <MenuButton
                  disabled={!editor}
                  icon={<CompassIcon name="heading1" />}
                  label={t('editor.heading1')}
                  onPress={() => { if (editor) turnInto(editor, 'heading1') }}
                  pressed={toolbarState.isHeading1}
                />
                <MenuButton
                  disabled={!editor}
                  icon={<CompassIcon name="heading2" />}
                  label={t('editor.heading2')}
                  onPress={() => { if (editor) turnInto(editor, 'heading2') }}
                  pressed={toolbarState.isHeading2}
                />
                <MenuButton
                  disabled={!editor}
                  icon={<CompassIcon name="heading2" />}
                  label={t('editor.heading3')}
                  onPress={() => { if (editor) turnInto(editor, 'heading3') }}
                />
                <MenuButton
                  disabled={!editor}
                  icon={<CompassIcon name="quote" />}
                  label={t('editor.blockquote')}
                  onPress={() => { if (editor) turnInto(editor, 'blockquote') }}
                  pressed={toolbarState.isBlockquote}
                />
                <MenuButton
                  disabled={!editor}
                  icon={<CompassIcon name="code" />}
                  label={t('editor.codeBlock')}
                  onPress={() => { if (editor) turnInto(editor, 'codeBlock') }}
                  pressed={toolbarState.isCodeBlock}
                />
              </div>
            </div>

            <div className="sn-editor-tools-menu__section" role="group">
              <span className="sn-editor-tools-menu__label">{t('editor.groupLists')}</span>
              <div className="sn-editor-tools-menu__row">
                <MenuButton
                  disabled={!editor}
                  icon={<CompassIcon name="bulletList" />}
                  label={t('editor.bulletList')}
                  onPress={() => { if (editor) turnInto(editor, 'bulletList') }}
                  pressed={toolbarState.isBulletList}
                />
                <MenuButton
                  disabled={!editor}
                  icon={<CompassIcon name="numberedList" />}
                  label={t('editor.orderedList')}
                  onPress={() => { if (editor) turnInto(editor, 'orderedList') }}
                  pressed={toolbarState.isOrderedList}
                />
                <MenuButton
                  disabled={!editor}
                  icon={<CompassIcon name="checkbox" />}
                  label={t('editor.todo')}
                  onPress={() => { if (editor) turnInto(editor, 'taskList') }}
                  pressed={toolbarState.isTaskList}
                />
                <MenuButton
                  disabled={!editor}
                  icon={<CompassIcon name="toggle" />}
                  label={t('editor.toggle')}
                  onPress={() => { if (editor) turnInto(editor, 'toggle') }}
                  pressed={toolbarState.isDetails}
                />
              </div>
            </div>

            <div className="sn-editor-tools-menu__section" role="group">
              <span className="sn-editor-tools-menu__label">{t('editor.groupInsert')}</span>
              <div className="sn-editor-tools-menu__row">
                <MenuButton
                  disabled={!editor}
                  icon={<CompassIcon name="callout" />}
                  label={t('editor.callout')}
                  onPress={() => { if (editor) turnInto(editor, 'callout') }}
                  pressed={toolbarState.isCallout}
                />
                <MenuButton
                  disabled={!editor}
                  icon={<CompassIcon name="divider" />}
                  label={t('editor.insertDivider')}
                  onPress={() => runCommand(() => editor?.chain().focus().setHorizontalRule().run())}
                />
                <MenuButton
                  disabled={!editor || !onInsertImage}
                  icon={<CompassIcon name="image" />}
                  label={t('editor.insertImage')}
                  onPress={() => runCommand(() => onInsertImage?.())}
                />
                <MenuButton
                  disabled={!editor || toolbarState.isTable}
                  icon={<CompassIcon name="table" />}
                  label={t('editor.insertTable')}
                  onPress={() => {
                    runCommand(() =>
                      editor
                        ?.chain()
                        .focus()
                        .insertTable({ cols: 3, rows: 3, withHeaderRow: true })
                        .run(),
                    )
                  }}
                />
                <MenuButton
                  disabled={!editor}
                  icon={<span className="sn-editor-menu-button__glyph">∑</span>}
                  label={t('editor.inlineEquation')}
                  onPress={() => onOpenMath('inline')}
                />
                <MenuButton
                  disabled={!editor}
                  icon={<span className="sn-editor-menu-button__glyph">∑</span>}
                  label={t('editor.equationBlock')}
                  onPress={() => onOpenMath('block')}
                />
              </div>
            </div>
          </div>,
          document.body,
        ) : null}

        {openPanel === 'table' ? createPortal(
          <div
            className="sn-editor-tools-menu sn-editor-tools-menu--floating"
            ref={toolsMenuRef}
            role="menu"
            style={toolsMenuStyle ?? { visibility: 'hidden' }}
          >
            {!toolbarState.isTable ? (
              <p className="sn-editor-tools-menu__empty">{t('editor.tableEmptyHint')}</p>
            ) : null}

            <div className="sn-editor-tools-menu__section" role="group">
              <span className="sn-editor-tools-menu__label">{t('editor.groupTableRows')}</span>
              <div className="sn-editor-tools-menu__row">
                <MenuButton
                  disabled={!editor || !toolbarState.canAddTableRow}
                  icon={<UiIcon name="arrowUp" />}
                  label={t('editor.addRowBefore')}
                  onPress={() => runCommand(() => editor?.chain().focus().addRowBefore().run())}
                />
                <MenuButton
                  disabled={!editor || !toolbarState.canAddTableRow}
                  icon={<UiIcon name="arrowDown" />}
                  label={t('editor.addRowAfter')}
                  onPress={() => runCommand(() => editor?.chain().focus().addRowAfter().run())}
                />
                <MenuButton
                  disabled={!editor || !toolbarState.canDeleteTableRow}
                  icon={<UiIcon name="trash" />}
                  label={t('editor.deleteRow')}
                  onPress={() => runCommand(() => editor?.chain().focus().deleteRow().run())}
                />
                <MenuButton
                  disabled={!editor || !toolbarState.isTable}
                  icon={<CompassIcon name="table" />}
                  label={t('editor.toggleHeaderRow')}
                  onPress={() => runCommand(() => editor?.chain().focus().toggleHeaderRow().run())}
                />
              </div>
            </div>

            <div className="sn-editor-tools-menu__section" role="group">
              <span className="sn-editor-tools-menu__label">{t('editor.groupTableColumns')}</span>
              <div className="sn-editor-tools-menu__row">
                <MenuButton
                  disabled={!editor || !toolbarState.canAddTableColumn}
                  icon={<UiIcon name="chevronLeft" />}
                  label={t('editor.addColumnBefore')}
                  onPress={() => runCommand(() => editor?.chain().focus().addColumnBefore().run())}
                />
                <MenuButton
                  disabled={!editor || !toolbarState.canAddTableColumn}
                  icon={<UiIcon name="chevronRight" />}
                  label={t('editor.addColumnAfter')}
                  onPress={() => runCommand(() => editor?.chain().focus().addColumnAfter().run())}
                />
                <MenuButton
                  disabled={!editor || !toolbarState.canDeleteTableColumn}
                  icon={<UiIcon name="trash" />}
                  label={t('editor.deleteColumn')}
                  onPress={() => runCommand(() => editor?.chain().focus().deleteColumn().run())}
                />
                <MenuButton
                  disabled={!editor || !toolbarState.isTable}
                  icon={<CompassIcon name="table" />}
                  label={t('editor.toggleHeaderColumn')}
                  onPress={() => runCommand(() => editor?.chain().focus().toggleHeaderColumn().run())}
                />
              </div>
            </div>

            <div className="sn-editor-tools-menu__section" role="group">
              <span className="sn-editor-tools-menu__label">{t('editor.groupTableCells')}</span>
              <div className="sn-editor-tools-menu__row">
                <MenuButton
                  disabled={!editor || !toolbarState.canMergeCells}
                  icon={<CompassIcon name="table" />}
                  label={t('editor.mergeCells')}
                  onPress={() => runCommand(() => editor?.chain().focus().mergeCells().run())}
                />
                <MenuButton
                  disabled={!editor || !toolbarState.canSplitCell}
                  icon={<CompassIcon name="table" />}
                  label={t('editor.splitCell')}
                  onPress={() => runCommand(() => editor?.chain().focus().splitCell().run())}
                />
                <MenuButton
                  disabled={!editor || toolbarState.isTable}
                  icon={<CompassIcon name="table" />}
                  label={t('editor.insertTable')}
                  onPress={() => {
                    runCommand(() =>
                      editor
                        ?.chain()
                        .focus()
                        .insertTable({ cols: 3, rows: 3, withHeaderRow: true })
                        .run(),
                    )
                  }}
                />
                <MenuButton
                  disabled={!editor || !toolbarState.canDeleteTable}
                  icon={<UiIcon name="trash" />}
                  label={t('editor.deleteTable')}
                  onPress={() => runCommand(() => editor?.chain().focus().deleteTable().run())}
                />
              </div>
            </div>
          </div>,
          document.body,
        ) : null}
      </div>
      <span className="sn-editor-toolbar__divider" aria-hidden="true" />

      <div
        className="sn-editor-toolbar__group sn-editor-toolbar__group--history"
        aria-label={t('editor.groupHistory')}
        role="group"
      >
        <ToolbarButton
          disabled={!editor || !toolbarState.canUndo}
          label={t('editor.undo')}
          onPress={() => {
            runCommand(() => editor?.chain().focus().undo().run())
          }}
        >
          <span className="sn-editor-tool-label">{t('editor.undo')}</span>
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor || !toolbarState.canRedo}
          label={t('editor.redo')}
          onPress={() => {
            runCommand(() => editor?.chain().focus().redo().run())
          }}
        >
          <span className="sn-editor-tool-label">{t('editor.redo')}</span>
        </ToolbarButton>
      </div>
    </div>
  )
}

function MathPreview({ kind, latex }: { kind: MathKind; latex: string }) {
  const { t } = useTranslation()
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!previewRef.current) {
      return
    }

    if (!latex.trim()) {
      previewRef.current.replaceChildren()
      return
    }

    katex.render(latex, previewRef.current, {
      displayMode: kind === 'block',
      output: 'htmlAndMathml',
      strict: 'warn',
      throwOnError: false,
    })
  }, [kind, latex])

  return (
    <div
      aria-label={t('editor.equationPreview')}
      className="sn-math-editor__preview"
      data-empty={!latex.trim()}
      ref={previewRef}
    />
  )
}

type MathEditorPanelProps = {
  draft: MathEditorDraft
  onCancel: () => void
  onChange: (latex: string) => void
  onDelete: (() => void) | null
  onSave: () => void
}

function MathEditorPanel({
  draft,
  onCancel,
  onChange,
  onDelete,
  onSave,
}: MathEditorPanelProps) {
  const { t } = useTranslation()

  return (
    <section aria-label={t('editor.equationEditor')} className="sn-math-editor">
      <span
        aria-hidden="true"
        className="sn-math-editor__mark"
        title={t(draft.kind === 'block' ? 'editor.equationBlock' : 'editor.inlineEquation')}
      >
        ∑
      </span>
      <label className="sn-math-editor__field">
        <span className="sn-sr-only">{t('editor.latexExpression')}</span>
        <input
          aria-label={t('editor.latexExpression')}
          autoFocus
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              onCancel()
            }

            if (event.key === 'Enter') {
              event.preventDefault()
              onSave()
            }
          }}
          placeholder={draft.kind === 'block' ? String.raw`\frac{a}{b} = c` : 'E = mc^2'}
          spellCheck={false}
          value={draft.latex}
        />
      </label>
      <MathPreview kind={draft.kind} latex={draft.latex} />
      <div className="sn-math-editor__actions">
        {onDelete ? (
          <button
            aria-label={t('editor.equationDelete')}
            className="sn-math-editor__delete"
            onClick={onDelete}
            title={t('editor.equationDelete')}
            type="button"
          >
            <UiIcon name="trash" />
          </button>
        ) : null}
        <button
          aria-label={t('editor.closeEquationEditor')}
          onClick={onCancel}
          title={t('editor.closeEquationEditor')}
          type="button"
        >
          <UiIcon name="close" />
        </button>
        <button
          aria-label={t(draft.mode === 'edit' ? 'editor.equationUpdate' : 'editor.equationInsert')}
          className="sn-math-editor__save"
          disabled={!draft.latex.trim()}
          onClick={onSave}
          title={t(draft.mode === 'edit' ? 'editor.equationUpdate' : 'editor.equationInsert')}
          type="button"
        >
          <UiIcon name="check" />
        </button>
      </div>
    </section>
  )
}

type EditableNoteEditorProps = {
  note: PlaintextLocalNote
  onChangeDocument: (noteId: NoteId, document: NoteDocument) => Promise<void>
  onChangeTitle: (noteId: NoteId, title: string) => Promise<void>
  editorApiRef?: { current: EditorShellApi | null }
  imageResolver?: ImageSourceResolver | null
  onImportImage?: ImportImageHandler | null
}

const acceptedImageTypes = 'image/jpeg,image/png,image/webp,image/gif,image/avif'

function pickImageFiles(files: FileList | null | undefined): File[] {
  return files ? [...files].filter((file) => file.type.startsWith('image/')) : []
}

/**
 * Manual-save model: the user commits changes with the Save button (or
 * Ctrl/Cmd+S), while a near-real-time background autosave is the actual
 * safety net against losing work to a crash or a closed tab. This can stay
 * short because "echo" content resets are prevented separately, by the
 * incoming-document effect never overwriting a draft or a focused editor.
 */
const backgroundAutosaveIntervalMs = 800

function EditableNoteEditor({
  note,
  onChangeDocument,
  onChangeTitle,
  editorApiRef,
  imageResolver = null,
  onImportImage = null,
}: EditableNoteEditorProps) {
  const { t } = useTranslation()
  const [titleDraft, setTitleDraft] = useState(note.title)
  const [autosaveState, setAutosaveState] = useState<AutosaveState>('saved')
  const [importNotice, setImportNotice] = useState<string | null>(null)
  const [importingCount, setImportingCount] = useState(0)
  const [mathDraft, setMathDraft] = useState<MathEditorDraft | null>(null)
  const didFocusEmptyNoteRef = useRef(false)
  const onChangeDocumentRef = useRef(onChangeDocument)
  const onChangeTitleRef = useRef(onChangeTitle)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const insertImageFilesRef = useRef<
    ((files: File[], dropPos: number | null) => Promise<void>) | null
  >(null)
  const documentAutosave = useMemo(
    () =>
      createDebouncedAutosave<DocumentAutosavePayload>({
        delayMs: backgroundAutosaveIntervalMs,
        onError: () => {
          setAutosaveState('error')
        },
        async save(payload) {
          setAutosaveState('saving')
          await onChangeDocumentRef.current(payload.noteId, payload.document)
          setAutosaveState('saved')
        },
      }),
    [],
  )
  const titleAutosave = useMemo(
    () =>
      createDebouncedAutosave<TitleAutosavePayload>({
        delayMs: backgroundAutosaveIntervalMs,
        onError: () => {
          setAutosaveState('error')
        },
        async save(payload) {
          setAutosaveState('saving')
          await onChangeTitleRef.current(payload.noteId, normalizeTitle(payload.title))
          setAutosaveState('saved')
        },
      }),
    [],
  )
  const initialContent = useMemo(
    () => normalizeEditorContent(note.document),
    [note.document],
  )
  const editor = useEditor({
    autofocus: false,
    content: initialContent,
    editorProps: {
      attributes: {
        'aria-label': t('editor.noteBody'),
        'aria-multiline': 'true',
        class: 'sn-tiptap-prosemirror',
        'data-placeholder': t('editor.placeholder'),
        role: 'textbox',
        spellcheck: 'true',
      },
      handleKeyDown(_view, event) {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault()
          void Promise.all([titleAutosave.flush(), documentAutosave.flush()])
          return true
        }

        return false
      },
      handlePaste(_view, event) {
        const images = pickImageFiles(event.clipboardData?.files)

        if (images.length === 0) {
          return false
        }

        event.preventDefault()
        void insertImageFilesRef.current?.(images, null)
        return true
      },
      handleDrop(view, event, _slice, moved) {
        // `moved` covers blocks dragged within the editor; only external
        // file drops become image imports.
        const images = moved ? [] : pickImageFiles(event.dataTransfer?.files)

        if (images.length === 0) {
          return false
        }

        event.preventDefault()
        const dropPosition = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        })
        void insertImageFilesRef.current?.(images, dropPosition?.pos ?? null)
        return true
      },
    },
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        codeBlock: {
          enableTabIndentation: true,
          tabSize: 2,
        },
      }),
      CodeBlockEscapeExit,
      TableKit.configure({
        table: {
          allowTableNodeSelection: true,
          cellMinWidth: 92,
          handleWidth: 6,
          lastColumnResizable: false,
          resizable: true,
        },
      }),
      ...TaskListExtensions,
      ...ToggleExtensions,
      Callout,
      ImageBlock,
      ...NoteTextStyleExtensions,
      Mathematics.configure({
        blockOptions: {
          onClick(node, pos) {
            setMathDraft({
              kind: 'block',
              latex: typeof node.attrs.latex === 'string' ? node.attrs.latex : '',
              mode: 'edit',
              pos,
            })
          },
        },
        inlineOptions: {
          onClick(node, pos) {
            setMathDraft({
              kind: 'inline',
              latex: typeof node.attrs.latex === 'string' ? node.attrs.latex : '',
              mode: 'edit',
              pos,
            })
          },
        },
        katexOptions: {
          output: 'htmlAndMathml',
          strict: 'warn',
          throwOnError: false,
        },
      }),
      BlockLayout,
      PageLayout,
    ],
    immediatelyRender: false,
    onBlur() {
      void documentAutosave.flush()
    },
    onUpdate({ editor }) {
      setAutosaveState('queued')
      documentAutosave.schedule({
        document: createDocumentFromEditorJson(editor.getJSON()),
        noteId: note.id,
      })
    },
  })
  const pageLayout = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) =>
      currentEditor
        ? getPageLayout(currentEditor.state)
        : {
            pageFooterOffset: defaultPageFooterOffset,
            pageHeaderOffset: defaultPageHeaderOffset,
            pageMeasure: defaultPageMeasure,
          },
  }) ?? {
    pageFooterOffset: defaultPageFooterOffset,
    pageHeaderOffset: defaultPageHeaderOffset,
    pageMeasure: defaultPageMeasure,
  }
  const savePresentation = getLocalSavePresentation(autosaveState)
  const statusBadges = [
    {
      icon: savePresentation.icon,
      label: t(savePresentation.badgeKey),
      title: t('editor.saveTitle', { state: t(savePresentation.labelKey) }),
    },
    {
      icon: 'shield' as const,
      label: t('editor.localOnly'),
      title: t('editor.privacyLocal'),
    },
  ]

  const canInsertImages = Boolean(onImportImage)

  async function insertImageFiles(files: File[], dropPos: number | null) {
    if (!editor || !onImportImage) {
      return
    }

    let insertAt = dropPos

    for (const file of files) {
      setImportingCount((count) => count + 1)

      try {
        // The blob is fully persisted before the node lands in the document,
        // so the document only ever references stored images.
        const imported = await onImportImage(note.id, file)
        const attrs = {
          imageId: imported.imageId,
          naturalWidth: imported.width,
          naturalHeight: imported.height,
        }

        if (insertAt !== null) {
          editor.chain().focus().insertImageBlockAt(insertAt, attrs).run()
          insertAt = null
        } else {
          const range = getCurrentTopLevelBlockRange(editor)
          const position = range ? range.to : editor.state.doc.content.size
          editor.chain().focus().insertImageBlockAt(position, attrs).run()
        }
      } catch (error) {
        setImportNotice(
          error instanceof Error ? error.message : 'The image could not be added.',
        )
      } finally {
        setImportingCount((count) => Math.max(0, count - 1))
      }
    }
  }

  insertImageFilesRef.current = canInsertImages ? insertImageFiles : null

  function openImagePicker() {
    fileInputRef.current?.click()
  }

  function openMathEditor(kind: MathKind) {
    setMathDraft({ kind, latex: '', mode: 'insert', pos: null })
  }

  function saveMathDraft() {
    if (!editor || !mathDraft?.latex.trim()) {
      return
    }

    const latex = mathDraft.latex.trim()
    const chain = editor.chain().focus()

    if (mathDraft.mode === 'insert') {
      if (mathDraft.kind === 'block') {
        chain.insertBlockMath({ latex }).run()
      } else {
        chain.insertInlineMath({ latex }).run()
      }
    } else if (mathDraft.kind === 'block' && mathDraft.pos !== null) {
      chain.updateBlockMath({ latex, pos: mathDraft.pos }).run()
    } else if (mathDraft.kind === 'inline' && mathDraft.pos !== null) {
      chain.updateInlineMath({ latex, pos: mathDraft.pos }).run()
    }

    setMathDraft(null)
  }

  function deleteMathDraft() {
    if (!editor || mathDraft?.mode !== 'edit' || mathDraft.pos === null) {
      return
    }

    const chain = editor.chain().focus()

    if (mathDraft.kind === 'block') {
      chain.deleteBlockMath({ pos: mathDraft.pos }).run()
    } else {
      chain.deleteInlineMath({ pos: mathDraft.pos }).run()
    }

    setMathDraft(null)
  }

  useEffect(() => {
    if (!editorApiRef) {
      return
    }

    editorApiRef.current = {
      revealImage(imageId) {
        if (!editor) {
          return
        }

        let foundPosition: number | null = null

        editor.state.doc.descendants((node, position) => {
          if (foundPosition !== null) {
            return false
          }

          if (node.type.name === 'imageBlock' && node.attrs.imageId === imageId) {
            foundPosition = position
            return false
          }

          return true
        })

        if (foundPosition === null) {
          return
        }

        editor.commands.setNodeSelection(foundPosition)
        const dom = editor.view.nodeDOM(foundPosition)

        if (dom instanceof HTMLElement) {
          dom.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }

        // The node view listens for this and drives the highlight from
        // React state, so its own re-renders can't wipe the class.
        document.dispatchEvent(
          new CustomEvent('sn-image-flash', { detail: { imageId } }),
        )
      },
    }

    return () => {
      editorApiRef.current = null
    }
  }, [editor, editorApiRef])

  useEffect(() => {
    onChangeDocumentRef.current = onChangeDocument
  }, [onChangeDocument])

  // The editor is built once, so its accessible name and placeholder would
  // otherwise keep the locale that happened to be active at mount.
  useEffect(() => {
    if (!editor) return

    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: {
          ...(editor.options.editorProps.attributes as Record<string, string>),
          'aria-label': t('editor.noteBody'),
          'data-placeholder': t('editor.placeholder'),
        },
      },
    })
    // The empty-note placeholder is drawn by CSS on the first paragraph, which
    // cannot read an attribute set on the editor root — so the copy travels
    // down as a custom property instead of being frozen into the stylesheet.
    editor.view.dom.style.setProperty(
      '--sn-editor-placeholder',
      JSON.stringify(t('editor.placeholder')),
    )
    editor.view.dispatch(editor.state.tr)
  }, [editor, t])

  useEffect(() => {
    if (!editor || didFocusEmptyNoteRef.current || !editor.isEmpty) {
      return
    }

    // The ref is set once the rAF actually fires, not when it's scheduled:
    // StrictMode's mount→cleanup→mount cancels the first rAF, and marking the
    // ref up front would make the second (real) pass see it as already done.
    const focusFrame = window.requestAnimationFrame(() => {
      didFocusEmptyNoteRef.current = true
      editor.commands.focus('start')
    })

    return () => window.cancelAnimationFrame(focusFrame)
  }, [editor])

  useEffect(() => {
    onChangeTitleRef.current = onChangeTitle
  }, [onChangeTitle])

  useEffect(() => {
    setMathDraft(null)
  }, [note.id])

  useEffect(() => {
    // Don't clobber a title the user is still typing: with the manual-save
    // model the incoming prop can only be the echo of our own save.
    if (titleAutosave.hasPending()) {
      return
    }

    setTitleDraft(note.title)
  }, [note.id, note.title, titleAutosave])

  useEffect(() => {
    if (!editor) {
      return
    }

    // While a draft is pending or the user is typing, the incoming document is
    // the echo of our own save; resetting content would yank the caret and
    // make the text "jump" mid-keystroke.
    if (documentAutosave.hasPending() || editor.isFocused) {
      return
    }

    const nextContent = normalizeEditorContent(note.document)

    if (!isSameContent(editor.getJSON(), nextContent)) {
      editor.commands.setContent(nextContent, { emitUpdate: false })
    }
  }, [documentAutosave, editor, note.document])

  useEffect(
    () => () => {
      void titleAutosave.flush()
      void documentAutosave.flush()
    },
    [documentAutosave, note.id, titleAutosave],
  )

  useEffect(() => {
    function flushPendingChanges() {
      void titleAutosave.flush()
      void documentAutosave.flush()
    }

    function flushWhenHidden() {
      if (document.visibilityState === 'hidden') {
        flushPendingChanges()
      }
    }

    document.addEventListener('visibilitychange', flushWhenHidden)
    window.addEventListener('beforeunload', flushPendingChanges)
    window.addEventListener('pagehide', flushPendingChanges)

    return () => {
      document.removeEventListener('visibilitychange', flushWhenHidden)
      window.removeEventListener('beforeunload', flushPendingChanges)
      window.removeEventListener('pagehide', flushPendingChanges)
    }
  }, [documentAutosave, titleAutosave])

  return (
    <div
      className="sn-editor-paper-sheet"
      style={
        {
          '--sn-page-footer-offset': `${pageLayout.pageFooterOffset}px`,
          '--sn-page-header-offset': `${pageLayout.pageHeaderOffset}px`,
          '--sn-page-measure': `${pageLayout.pageMeasure}ch`,
        } as CSSProperties
      }
    >
      <header className="sn-editor-topbar">
        <div className="sn-editor-title-row">
          <div className="sn-editor-title-group">
            <span className="sn-editor-icon">
              <LegacyUiIcon name="document" />
            </span>
            <label className="sn-editor-title-label" htmlFor="sn-editor-title">
              <span className="sn-sr-only">{t('editor.noteTitle')}</span>
              <input
                aria-label={t('editor.noteTitle')}
                className="sn-editor-document-title sn-editor-title-input"
                id="sn-editor-title"
                onBlur={() => {
                  void titleAutosave.flush()
                }}
                onChange={(event) => {
                  setAutosaveState('queued')
                  setTitleDraft(event.target.value)
                  titleAutosave.schedule({
                    noteId: note.id,
                    title: event.target.value,
                  })
                }}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                    event.preventDefault()
                    void Promise.all([titleAutosave.flush(), documentAutosave.flush()])
                    return
                  }

                  if (event.key === 'Enter') {
                    event.preventDefault()
                    editor?.chain().focus().run()
                  }
                }}
                value={titleDraft}
              />
            </label>
          </div>
          <div className="sn-editor-status-badges" aria-label={t('editor.noteStatus')}>
            {statusBadges.map((badge) => (
              <span className="sn-editor-status-badge" key={badge.title} title={badge.title}>
                <UiIcon name={badge.icon} />
                {badge.label}
              </span>
            ))}
          </div>
          <div className="sn-editor-actions">
            <SquircleButton
              aria-label={t('editor.exportPdf')}
              className="sn-pdf-export-button"
              icon="download"
              onClick={() => exportNoteToPdf(titleDraft)}
              size="small"
              title={t('editor.exportPdfHint')}
            />
            <SquircleButton
              aria-label={t('editor.saveNote')}
              disabled={autosaveState === 'saved' || autosaveState === 'saving'}
              icon="save"
              onClick={() => {
                void Promise.all([titleAutosave.flush(), documentAutosave.flush()])
              }}
              size="small"
              title={t('editor.saveNoteHint')}
            />
          </div>
        </div>
      </header>

      <EditorToolbar
        editor={editor}
        onInsertImage={canInsertImages ? openImagePicker : null}
        onOpenMath={openMathEditor}
      />

      {mathDraft ? (
        <MathEditorPanel
          draft={mathDraft}
          onCancel={() => setMathDraft(null)}
          onChange={(latex) => setMathDraft((draft) => (draft ? { ...draft, latex } : draft))}
          onDelete={mathDraft.mode === 'edit' ? deleteMathDraft : null}
          onSave={saveMathDraft}
        />
      ) : null}

      {canInsertImages ? (
        <input
          accept={acceptedImageTypes}
          aria-label={t('editor.addImages')}
          hidden
          multiple
          onChange={(event) => {
            const files = pickImageFiles(event.target.files)
            event.target.value = ''

            if (files.length > 0) {
              void insertImageFiles(files, null)
            }
          }}
          ref={fileInputRef}
          type="file"
        />
      ) : null}

      {importingCount > 0 || importNotice ? (
        <div aria-live="polite" className="sn-editor-notice" role="status">
          {importingCount > 0 ? (
            <span className="sn-editor-notice__busy">Importing image…</span>
          ) : null}
          {importNotice ? (
            <>
              <span>{importNotice}</span>
              <button
                aria-label={t('editor.dismissMessage')}
                onClick={() => setImportNotice(null)}
                type="button"
              >
                <UiIcon name="close" />
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      <ImageSourceContext.Provider value={imageResolver}>
        <div className="sn-editor-paper sn-editor-paper--editable">
          <h1 className="sn-print-note-title">{normalizeTitle(titleDraft)}</h1>
          <div className="sn-page-layout-frame">
            <div className="sn-editor-reading-column">
              <BlockHandle
                editor={editor}
                onInsertImage={canInsertImages ? openImagePicker : null}
              />
              <EditorContent className="sn-editor-content" editor={editor} />
            </div>
          </div>
        </div>
      </ImageSourceContext.Provider>
    </div>
  )
}

export function EditorShell({
  hasRemote = false,
  note,
  onChangeDocument,
  onChangeTitle,
  onCreateNote,
  isCreatingNote = false,
  onBrowseTemplates,
  pendingOperations,
  syncStatus,
  editorApiRef,
  imageResolver = null,
  onImportImage = null,
}: EditorShellProps) {
  const { t } = useTranslation()

  if (!note) {
    return (
      <article
        className="sn-editor-shell sn-editor-shell--empty"
        aria-label={t('editor.region')}
      >
        {/* Desktop: decorative player (hidden on mobile via CSS) */}
        <EmptyStatePlayer
          isCreatingNote={isCreatingNote}
          onCreateNote={onCreateNote}
          pendingOperations={pendingOperations}
          syncStatus={syncStatus}
        />
        <div className="sn-mobile-empty-state" aria-hidden="true">
          <span className="sn-mobile-empty-state__icon">
            <UiIcon name="document" />
          </span>
          <strong>Start with a note</strong>
          <p>Create a blank page or choose a template to begin writing.</p>
        </div>
        <div className="sn-empty-actions" aria-label={t('editor.createNote')}>
          <button
            className="sn-empty-actions__primary"
            disabled={isCreatingNote}
            onClick={onCreateNote}
            type="button"
          >
            <UiIcon name="plus" />
            New blank note
          </button>
          {onBrowseTemplates ? (
            <button onClick={onBrowseTemplates} type="button">
              <UiIcon name="template" />
              Browse templates
            </button>
          ) : null}
        </div>
      </article>
    )
  }
  const lockedPersistence = getPersistencePresentation({
    hasRemote,
    pendingOperations,
    status: note.syncStatus,
  })
  const lockedStatusBadges = [
    {
      icon: 'lock' as const,
      label: t('editor.locked'),
      title: t('editor.privacyLocked'),
    },
    {
      icon: lockedPersistence.icon,
      label: t(lockedPersistence.badgeKey),
      title: t('editor.stateTitle', { state: t(lockedPersistence.labelKey) }),
    },
  ]

  return (
    <article className="sn-editor-shell" aria-label={t('editor.region')}>
      {note.isLocked ? (
        <div className="sn-editor-paper-sheet">
          <header className="sn-editor-topbar">
            <div className="sn-editor-title-row">
              <div className="sn-editor-title-group">
                <span className="sn-editor-icon">
                  <UiIcon name="lock" />
                </span>
                <h1 className="sn-editor-document-title">Locked note</h1>
              </div>
              <div className="sn-editor-status-badges" aria-label={t('editor.noteStatus')}>
                {lockedStatusBadges.map((badge) => (
                  <span className="sn-editor-status-badge" key={badge.title} title={badge.title}>
                    <UiIcon name={badge.icon} />
                    {badge.label}
                  </span>
                ))}
              </div>
            </div>
          </header>

          <div className="sn-editor-paper">
            <div className="sn-locked-paper">
              <UiIcon name="lock" />
              <h3>Encrypted</h3>
              <p>Master password required.</p>
            </div>
          </div>
        </div>
      ) : (
        <EditableNoteEditor
          editorApiRef={editorApiRef}
          imageResolver={imageResolver}
          key={note.id}
          note={note}
          onChangeDocument={onChangeDocument}
          onChangeTitle={onChangeTitle}
          onImportImage={onImportImage}
        />
      )}
    </article>
  )
}
