import { Extension } from '@tiptap/core'
import { TableKit } from '@tiptap/extension-table'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import {
  documentNodeSchema,
  parseNoteDocument,
  type NoteDocument,
} from '@/shared/contracts/document'
import type {
  NoteDetail,
  NoteId,
  PlaintextLocalNote,
} from '@/shared/contracts/note'
import {
  Callout,
  createDebouncedAutosave,
  TaskListExtensions,
  ToggleExtensions,
  turnInto,
} from '@/ui/editor'
import { BlockHandle } from '@/ui/components/notes/BlockHandle'
import { EmptyStatePlayer } from '@/ui/components/notes/EmptyStatePlayer'
import { UiIcon } from '@/ui/icons/ui/UiIcon'

type EditorShellProps = {
  note: NoteDetail | null
  onChangeDocument: (noteId: NoteId, document: NoteDocument) => Promise<void>
  onChangeTitle: (noteId: NoteId, title: string) => Promise<void>
  onCreateNote: () => void
  onRequestLock: (noteId: NoteId) => void
  pendingOperations: number
  syncStatus: string
}

type AutosaveState = 'saved' | 'queued' | 'saving' | 'error'

const autosaveLabels: Record<AutosaveState, string> = {
  error: 'Needs review',
  queued: 'Unsaved locally',
  saved: 'Saved locally',
  saving: 'Saving',
}

const syncStatusLabels: Record<string, string> = {
  conflict: 'Review needed',
  dirty: 'Unsaved locally',
  error: 'Needs review',
  saving: 'Saving',
  synced: 'Saved locally',
  syncing: 'Saving',
}

function formatAutosaveState(state: AutosaveState): string {
  return autosaveLabels[state]
}

function formatSyncStatus(status: string): string {
  return syncStatusLabels[status] ?? status
}

function formatAutosaveBadge(state: AutosaveState): string {
  if (state === 'saved') return 'Saved'
  if (state === 'saving') return 'Saving'
  if (state === 'queued') return 'Unsaved'
  return 'Review'
}

function formatSyncBadge(status: string): string {
  if (status === 'synced' || status === 'idle') return 'Saved'
  if (status === 'saving' || status === 'syncing') return 'Saving'
  if (status === 'dirty') return 'Unsaved'
  if (status === 'conflict' || status === 'error') return 'Review'
  return 'Local'
}

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
}

const blockIndentMin = 0
const blockIndentMax = 6
const blockLayoutNodeTypes = ['paragraph', 'heading'] as const
const blockMarginValues = ['tight', 'normal', 'wide'] as const
const pageOffsetMin = 8
const pageOffsetMax = 132
const pageOffsetStep = 8

type BlockMarginValue = (typeof blockMarginValues)[number]

type BlockLayoutAttrs = {
  blockIndent: number
  blockMargin: BlockMarginValue
}

type PageLayoutAttrs = {
  pageFooterOffset: number
  pageHeaderOffset: number
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockLayout: {
      decreaseBlockIndent: () => ReturnType
      increaseBlockIndent: () => ReturnType
      setBlockIndent: (level: number) => ReturnType
      setBlockMargin: (margin: BlockMarginValue) => ReturnType
    }
    pageLayout: {
      adjustPageFooterOffset: (delta: number) => ReturnType
      adjustPageHeaderOffset: (delta: number) => ReturnType
      setPageFooterOffset: (offset: number) => ReturnType
      setPageHeaderOffset: (offset: number) => ReturnType
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

function clampPageOffset(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(parsed)) {
    return pageOffsetMin
  }

  return Math.min(pageOffsetMax, Math.max(pageOffsetMin, Math.round(parsed)))
}

function getPageLayout(state: EditorState): PageLayoutAttrs {
  return {
    pageFooterOffset: clampPageOffset(state.doc.attrs.pageFooterOffset ?? 40),
    pageHeaderOffset: clampPageOffset(state.doc.attrs.pageHeaderOffset ?? 40),
  }
}

function getNodeBlockLayout(node: ProseMirrorNode): BlockLayoutAttrs {
  return {
    blockIndent: clampBlockIndent(node.attrs.blockIndent),
    blockMargin: normalizeBlockMargin(node.attrs.blockMargin),
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
    : { blockIndent: blockIndentMin, blockMargin: 'normal' }
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
      setBlockMargin:
        (margin) =>
        ({ dispatch, state }) =>
          updateSelectedBlockLayout(state, dispatch, {
            blockMargin: normalizeBlockMargin(margin),
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
            default: 40,
          },
          pageHeaderOffset: {
            default: 40,
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

type MenuButtonProps = ToolbarButtonProps

function MenuButton({
  children,
  disabled = false,
  label,
  onPress,
  pressed = false,
}: MenuButtonProps) {
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
      {children}
    </button>
  )
}

function EditorToolbar({ editor }: EditorToolbarProps) {
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const state = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      blockLayout: currentEditor
        ? getSelectedBlockLayout(currentEditor.state)
        : { blockIndent: blockIndentMin, blockMargin: 'normal' as const },
      canAddTableColumn: currentEditor?.can().addColumnAfter() ?? false,
      canAddTableRow: currentEditor?.can().addRowAfter() ?? false,
      canDeleteTable: currentEditor?.can().deleteTable() ?? false,
      pageLayout: currentEditor
        ? getPageLayout(currentEditor.state)
        : { pageFooterOffset: 40, pageHeaderOffset: 40 },
      canRedo: currentEditor?.can().redo() ?? false,
      canUndo: currentEditor?.can().undo() ?? false,
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
    blockLayout: { blockIndent: blockIndentMin, blockMargin: 'normal' as const },
    canAddTableColumn: false,
    canAddTableRow: false,
    canDeleteTable: false,
    pageLayout: { pageFooterOffset: 40, pageHeaderOffset: 40 },
    canRedo: false,
    canUndo: false,
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
    if (!isMoreMenuOpen) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      if (!moreMenuRef.current?.contains(event.target as Node)) {
        setIsMoreMenuOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMoreMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isMoreMenuOpen])

  function runCommand(command: () => void) {
    command()
  }

  function setPageHeaderOffsetFromInput(value: string) {
    const nextOffset = Number(value)

    if (!Number.isFinite(nextOffset) || value.trim() === '') {
      return
    }

    runCommand(() => editor?.commands.setPageHeaderOffset(nextOffset))
  }

  function setPageFooterOffsetFromInput(value: string) {
    const nextOffset = Number(value)

    if (!Number.isFinite(nextOffset) || value.trim() === '') {
      return
    }

    runCommand(() => editor?.commands.setPageFooterOffset(nextOffset))
  }

  return (
    <div className="sn-editor-toolbar" aria-label="Editor toolbar" role="toolbar">
      <div className="sn-editor-toolbar__group" aria-label="Text formatting" role="group">
        <ToolbarButton
          disabled={!editor}
          label="Bold"
          onPress={() => {
            runCommand(() => editor?.chain().focus().toggleBold().run())
          }}
          pressed={toolbarState.isBold}
        >
          <span className="sn-editor-tool-label sn-editor-tool-label--bold">B</span>
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor}
          label="Italic"
          onPress={() => {
            runCommand(() => editor?.chain().focus().toggleItalic().run())
          }}
          pressed={toolbarState.isItalic}
        >
          <span className="sn-editor-tool-label sn-editor-tool-label--italic">I</span>
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor}
          label="Strike"
          onPress={() => {
            runCommand(() => editor?.chain().focus().toggleStrike().run())
          }}
          pressed={toolbarState.isStrike}
        >
          <span className="sn-editor-tool-label sn-editor-tool-label--strike">S</span>
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor}
          label="Inline code"
          onPress={() => {
            runCommand(() => editor?.chain().focus().toggleCode().run())
          }}
          pressed={toolbarState.isCode}
        >
          <span className="sn-editor-tool-label sn-editor-tool-label--code">Code</span>
        </ToolbarButton>
      </div>
      <span className="sn-editor-toolbar__divider" aria-hidden="true" />

      <div className="sn-editor-toolbar__group" aria-label="Document structure" role="group">
        <ToolbarButton
          disabled={!editor}
          label="Heading 1"
          onPress={() => {
            runCommand(() => editor?.chain().focus().toggleHeading({ level: 1 }).run())
          }}
          pressed={toolbarState.isHeading1}
        >
          <span className="sn-editor-tool-label">H1</span>
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor}
          label="Heading 2"
          onPress={() => {
            runCommand(() => editor?.chain().focus().toggleHeading({ level: 2 }).run())
          }}
          pressed={toolbarState.isHeading2}
        >
          <span className="sn-editor-tool-label">H2</span>
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor}
          label="Blockquote"
          onPress={() => {
            runCommand(() => editor?.chain().focus().toggleBlockquote().run())
          }}
          pressed={toolbarState.isBlockquote}
        >
          <span className="sn-editor-tool-label">Quote</span>
        </ToolbarButton>
      </div>
      <span className="sn-editor-toolbar__divider" aria-hidden="true" />

      <div className="sn-editor-toolbar__group" aria-label="Lists" role="group">
        <ToolbarButton
          disabled={!editor}
          label="Bullet list"
          onPress={() => {
            runCommand(() => editor?.chain().focus().toggleBulletList().run())
          }}
          pressed={toolbarState.isBulletList}
        >
          <span className="sn-editor-tool-label">Bullets</span>
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor}
          label="Ordered list"
          onPress={() => {
            runCommand(() => editor?.chain().focus().toggleOrderedList().run())
          }}
          pressed={toolbarState.isOrderedList}
        >
          <span className="sn-editor-tool-label">Numbers</span>
        </ToolbarButton>
      </div>
      <span className="sn-editor-toolbar__divider" aria-hidden="true" />

      <div
        className="sn-editor-toolbar__group sn-editor-toolbar__group--more"
        ref={moreMenuRef}
      >
        <ToolbarButton
          disabled={!editor}
          label="More editor tools"
          onPress={() => {
            setIsMoreMenuOpen((isOpen) => !isOpen)
          }}
          pressed={isMoreMenuOpen}
        >
          <UiIcon name="settings" />
        </ToolbarButton>
        {isMoreMenuOpen ? (
          <div className="sn-editor-tools-menu" role="menu">
            <div className="sn-editor-tools-menu__section" role="group">
              <span className="sn-editor-tools-menu__label">Blocks</span>
              <div className="sn-editor-tools-menu__row">
                <MenuButton
                  disabled={!editor}
                  label="Insert divider"
                  onPress={() => {
                    runCommand(() => editor?.chain().focus().setHorizontalRule().run())
                  }}
                >
                  Div
                </MenuButton>
                <MenuButton
                  disabled={!editor}
                  label="Code block"
                  onPress={() => {
                    runCommand(() => {
                      if (editor) turnInto(editor, 'codeBlock')
                    })
                  }}
                  pressed={toolbarState.isCodeBlock}
                >
                  Code
                </MenuButton>
                <MenuButton
                  disabled={!editor}
                  label="To-do"
                  onPress={() => {
                    runCommand(() => {
                      if (editor) turnInto(editor, 'taskList')
                    })
                  }}
                  pressed={toolbarState.isTaskList}
                >
                  To-do
                </MenuButton>
                <MenuButton
                  disabled={!editor}
                  label="Toggle"
                  onPress={() => {
                    runCommand(() => {
                      if (editor) turnInto(editor, 'toggle')
                    })
                  }}
                  pressed={toolbarState.isDetails}
                >
                  Tog
                </MenuButton>
                <MenuButton
                  disabled={!editor}
                  label="Callout"
                  onPress={() => {
                    runCommand(() => {
                      if (editor) turnInto(editor, 'callout')
                    })
                  }}
                  pressed={toolbarState.isCallout}
                >
                  Call
                </MenuButton>
              </div>
            </div>

            <div className="sn-editor-tools-menu__section" role="group">
              <span className="sn-editor-tools-menu__label">Margins</span>
              <div className="sn-editor-tools-menu__row">
                <MenuButton
                  disabled={!editor}
                  label="Tight margins"
                  onPress={() => {
                    runCommand(() => editor?.chain().focus().setBlockMargin('tight').run())
                  }}
                  pressed={toolbarState.blockLayout.blockMargin === 'tight'}
                >
                  M-
                </MenuButton>
                <MenuButton
                  disabled={!editor}
                  label="Normal margins"
                  onPress={() => {
                    runCommand(() => editor?.chain().focus().setBlockMargin('normal').run())
                  }}
                  pressed={toolbarState.blockLayout.blockMargin === 'normal'}
                >
                  M
                </MenuButton>
                <MenuButton
                  disabled={!editor}
                  label="Wide margins"
                  onPress={() => {
                    runCommand(() => editor?.chain().focus().setBlockMargin('wide').run())
                  }}
                  pressed={toolbarState.blockLayout.blockMargin === 'wide'}
                >
                  M+
                </MenuButton>
              </div>
            </div>

            <div className="sn-editor-tools-menu__section" role="group">
              <span className="sn-editor-tools-menu__label">Indent</span>
              <div className="sn-editor-tools-menu__row">
                <MenuButton
                  disabled={
                    !editor || toolbarState.blockLayout.blockIndent <= blockIndentMin
                  }
                  label="Decrease indent"
                  onPress={() => {
                    runCommand(() =>
                      editor?.chain().focus().decreaseBlockIndent().run(),
                    )
                  }}
                >
                  Out
                </MenuButton>
                <MenuButton
                  disabled={
                    !editor || toolbarState.blockLayout.blockIndent >= blockIndentMax
                  }
                  label="Increase indent"
                  onPress={() => {
                    runCommand(() =>
                      editor?.chain().focus().increaseBlockIndent().run(),
                    )
                  }}
                >
                  In
                </MenuButton>
              </div>
            </div>

            <div className="sn-editor-tools-menu__section" role="group">
              <span className="sn-editor-tools-menu__label">Table</span>
              <div className="sn-editor-tools-menu__row">
                <MenuButton
                  disabled={!editor || toolbarState.isTable}
                  label="Insert table"
                  onPress={() => {
                    runCommand(() =>
                      editor
                        ?.chain()
                        .focus()
                        .insertTable({ cols: 3, rows: 3, withHeaderRow: true })
                        .run(),
                    )
                  }}
                >
                  Tbl
                </MenuButton>
                <MenuButton
                  disabled={!editor || !toolbarState.canAddTableColumn}
                  label="Add column"
                  onPress={() => {
                    runCommand(() => editor?.chain().focus().addColumnAfter().run())
                  }}
                >
                  C+
                </MenuButton>
                <MenuButton
                  disabled={!editor || !toolbarState.canAddTableRow}
                  label="Add row"
                  onPress={() => {
                    runCommand(() => editor?.chain().focus().addRowAfter().run())
                  }}
                >
                  R+
                </MenuButton>
                <MenuButton
                  disabled={!editor || !toolbarState.isTable}
                  label="Toggle header row"
                  onPress={() => {
                    runCommand(() => editor?.chain().focus().toggleHeaderRow().run())
                  }}
                >
                  Hd
                </MenuButton>
                <MenuButton
                  disabled={!editor || !toolbarState.canDeleteTable}
                  label="Delete table"
                  onPress={() => {
                    runCommand(() => editor?.chain().focus().deleteTable().run())
                  }}
                >
                  Del
                </MenuButton>
              </div>
            </div>

            <div
              className="sn-editor-tools-menu__section sn-editor-tools-menu__section--page"
              role="group"
            >
              <span className="sn-editor-tools-menu__label">Page</span>
              <div className="sn-editor-page-settings">
                <label className="sn-editor-page-settings__field">
                  <span className="sn-editor-page-settings__name">Top</span>
                  <input
                    aria-label="Top page offset in pixels"
                    className="sn-editor-tools-menu__number"
                    disabled={!editor}
                    inputMode="numeric"
                    max={pageOffsetMax}
                    min={pageOffsetMin}
                    onChange={(event) => {
                      setPageHeaderOffsetFromInput(event.currentTarget.value)
                    }}
                    step={pageOffsetStep}
                    type="number"
                    value={toolbarState.pageLayout.pageHeaderOffset}
                  />
                  <span className="sn-editor-page-settings__unit">px</span>
                  <span className="sn-editor-tools-menu__value">
                    {toolbarState.pageLayout.pageHeaderOffset}px
                  </span>
                </label>

                <label className="sn-editor-page-settings__field">
                  <span className="sn-editor-page-settings__name">Bottom</span>
                  <input
                    aria-label="Bottom page offset in pixels"
                    className="sn-editor-tools-menu__number"
                    disabled={!editor}
                    inputMode="numeric"
                    max={pageOffsetMax}
                    min={pageOffsetMin}
                    onChange={(event) => {
                      setPageFooterOffsetFromInput(event.currentTarget.value)
                    }}
                    step={pageOffsetStep}
                    type="number"
                    value={toolbarState.pageLayout.pageFooterOffset}
                  />
                  <span className="sn-editor-page-settings__unit">px</span>
                  <span className="sn-editor-tools-menu__value">
                    {toolbarState.pageLayout.pageFooterOffset}px
                  </span>
                </label>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <span className="sn-editor-toolbar__divider" aria-hidden="true" />

      <div
        className="sn-editor-toolbar__group sn-editor-toolbar__group--history"
        aria-label="History"
        role="group"
      >
        <ToolbarButton
          disabled={!editor || !toolbarState.canUndo}
          label="Undo"
          onPress={() => {
            runCommand(() => editor?.chain().focus().undo().run())
          }}
        >
          <span className="sn-editor-tool-label">Undo</span>
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor || !toolbarState.canRedo}
          label="Redo"
          onPress={() => {
            runCommand(() => editor?.chain().focus().redo().run())
          }}
        >
          <span className="sn-editor-tool-label">Redo</span>
        </ToolbarButton>
      </div>
    </div>
  )
}

type EditableNoteEditorProps = {
  note: PlaintextLocalNote
  onChangeDocument: (noteId: NoteId, document: NoteDocument) => Promise<void>
  onChangeTitle: (noteId: NoteId, title: string) => Promise<void>
  onRequestLock: (noteId: NoteId) => void
}

function EditableNoteEditor({
  note,
  onChangeDocument,
  onChangeTitle,
  onRequestLock,
}: EditableNoteEditorProps) {
  const [titleDraft, setTitleDraft] = useState(note.title)
  const [autosaveState, setAutosaveState] = useState<AutosaveState>('saved')
  const onChangeDocumentRef = useRef(onChangeDocument)
  const onChangeTitleRef = useRef(onChangeTitle)
  const documentAutosave = useMemo(
    () =>
      createDebouncedAutosave<DocumentAutosavePayload>({
        delayMs: 450,
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
        delayMs: 450,
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
        'aria-label': 'Note body',
        'aria-multiline': 'true',
        class: 'sn-tiptap-prosemirror',
        role: 'textbox',
        spellcheck: 'true',
      },
    },
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
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
        : { pageFooterOffset: 40, pageHeaderOffset: 40 },
  }) ?? { pageFooterOffset: 40, pageHeaderOffset: 40 }
  const statusBadges = [
    {
      icon: 'cloud' as const,
      label: formatAutosaveBadge(autosaveState),
      title: `Save: ${formatAutosaveState(autosaveState)}`,
    },
    {
      icon: 'lock' as const,
      label: 'Private',
      title: 'Privacy: Private local note',
    },
  ]

  useEffect(() => {
    onChangeDocumentRef.current = onChangeDocument
  }, [onChangeDocument])

  useEffect(() => {
    onChangeTitleRef.current = onChangeTitle
  }, [onChangeTitle])

  useEffect(() => {
    setTitleDraft(note.title)
  }, [note.id, note.title])

  useEffect(() => {
    if (!editor) {
      return
    }

    const nextContent = normalizeEditorContent(note.document)

    if (!isSameContent(editor.getJSON(), nextContent)) {
      editor.commands.setContent(nextContent, { emitUpdate: false })
    }
  }, [editor, note.document])

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
    <div className="sn-editor-paper-sheet">
      <header className="sn-editor-topbar">
        <div className="sn-editor-title-row">
          <div className="sn-editor-title-group">
            <span className="sn-editor-icon">
              <UiIcon name="document" />
            </span>
            <label className="sn-editor-title-label" htmlFor="sn-editor-title">
              <span className="sn-sr-only">Note title</span>
              <input
                aria-label="Note title"
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
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    editor?.chain().focus().run()
                  }
                }}
                value={titleDraft}
              />
            </label>
          </div>
          <div className="sn-editor-status-badges" aria-label="Note status">
            {statusBadges.map((badge) => (
              <span className="sn-editor-status-badge" key={badge.title} title={badge.title}>
                <UiIcon name={badge.icon} />
                {badge.label}
              </span>
            ))}
          </div>
          <div className="sn-editor-actions">
            <button
              aria-label="Lock note"
              className="sn-icon-button"
              onClick={() => {
                void Promise.all([
                  titleAutosave.flush(),
                  documentAutosave.flush(),
                ]).finally(() => {
                  onRequestLock(note.id)
                })
              }}
              title="Lock note"
              type="button"
            >
              <UiIcon name="lock" />
            </button>
          </div>
        </div>
      </header>

      <EditorToolbar editor={editor} />

      <div
        className="sn-editor-paper sn-editor-paper--editable"
        style={
          {
            '--sn-page-footer-offset': `${pageLayout.pageFooterOffset}px`,
            '--sn-page-header-offset': `${pageLayout.pageHeaderOffset}px`,
          } as CSSProperties
        }
      >
        <div className="sn-page-layout-frame">
          <BlockHandle editor={editor} />
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  )
}

export function EditorShell({
  note,
  onChangeDocument,
  onChangeTitle,
  onCreateNote,
  onRequestLock,
  pendingOperations,
  syncStatus,
}: EditorShellProps) {
  if (!note) {
    return (
      <article
        className="sn-editor-shell sn-editor-shell--empty"
        aria-label="Editor"
      >
        {/* Desktop: decorative player (hidden on mobile via CSS) */}
        <EmptyStatePlayer
          onCreateNote={onCreateNote}
          pendingOperations={pendingOperations}
          syncStatus={syncStatus}
        />
      </article>
    )
  }
  const lockedStatusBadges = [
    {
      icon: 'lock' as const,
      label: 'Locked',
      title: 'Privacy: Locked note',
    },
    {
      icon: 'cloud' as const,
      label: formatSyncBadge(note.syncStatus),
      title: `State: ${formatSyncStatus(note.syncStatus)}`,
    },
  ]

  return (
    <article className="sn-editor-shell" aria-label="Editor">
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
              <div className="sn-editor-status-badges" aria-label="Note status">
                {lockedStatusBadges.map((badge) => (
                  <span className="sn-editor-status-badge" key={badge.title} title={badge.title}>
                    <UiIcon name={badge.icon} />
                    {badge.label}
                  </span>
                ))}
              </div>
              <div className="sn-editor-actions">
                <button className="sn-icon-button" disabled title="Already locked" type="button">
                  <UiIcon name="lock" />
                </button>
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
          key={note.id}
          note={note}
          onChangeDocument={onChangeDocument}
          onChangeTitle={onChangeTitle}
          onRequestLock={onRequestLock}
        />
      )}
    </article>
  )
}
