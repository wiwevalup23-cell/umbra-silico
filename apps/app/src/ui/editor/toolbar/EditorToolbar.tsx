import type { Editor } from '@tiptap/core'
import { redoDepth, undoDepth } from '@tiptap/pm/history'
import { useEditorState } from '@tiptap/react'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import {
  blockLineHeightMax,
  blockLineHeightMin,
  blockMarginValues,
  defaultBlockLayout,
  defaultPageFooterOffset,
  defaultPageHeaderOffset,
  defaultPageLayout,
  defaultPageMeasure,
  getPageLayout,
  getSelectedBlockLayout,
  pageMeasureMax,
  pageMeasureMin,
  pageOffsetMax,
  pageOffsetMin,
  textAlignValues,
  type MathKind,
} from '../extensions'
import {
  editorFontOptions,
  editorHighlightOptions,
  editorTextSizeOptions,
} from '@/ui/document'
import { turnInto } from '../turn-into'
import { CompassIcon } from '@/ui/icons/compass/CompassIcon'
import { UiIcon } from '@/ui/icons/ui/UiIcon'
import { useTranslation } from '@/ui/i18n/use-translation'
import {
  LayoutNumberField,
  MenuButton,
  TextAlignmentGlyph,
  ToolbarButton,
} from './controls'

export type EditorToolbarProps = {
  editor: Editor | null
  onInsertImage?: (() => void) | null
  onOpenMath: (kind: MathKind) => void
}

export function EditorToolbar({
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
  const toolbarRef = useRef<HTMLDivElement>(null)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const toolsMenuRef = useRef<HTMLDivElement>(null)
  const [toolsMenuStyle, setToolsMenuStyle] = useState<CSSProperties | null>(null)
  const state = useEditorState({
    editor,
    // Runs on every transaction, caret moves included. `isActive` is a cheap
    // read of the selection; `can()` is not — it builds a chainable state and
    // dry-runs the whole command. So the nine `can()` calls here cost about
    // 0.6 ms per transaction while all sixteen `isActive` calls together cost
    // 0.006 ms, and the sixteen are not what is worth avoiding.
    selector: ({ editor: currentEditor }) => {
      // The seven answers below are read in one place only — the table panel —
      // so while it is shut they are computed for nobody. Gating on the panel
      // rather than on `isActive('table')` is also the only gate that cannot
      // change an answer: a selection dragged from the paragraph above into a
      // table reports `isActive('table') === false` while the commands
      // themselves still apply, so that cheaper-looking gate would have
      // greyed out buttons that today work.
      const canProbeTable = currentEditor && openPanel === 'table'

      return {
        blockLayout: currentEditor
          ? getSelectedBlockLayout(currentEditor.state)
          : defaultBlockLayout,
        canAddTableColumn: canProbeTable ? currentEditor.can().addColumnAfter() : false,
        canAddTableRow: canProbeTable ? currentEditor.can().addRowAfter() : false,
        canDeleteTable: canProbeTable ? currentEditor.can().deleteTable() : false,
        canDeleteTableColumn: canProbeTable ? currentEditor.can().deleteColumn() : false,
        canDeleteTableRow: canProbeTable ? currentEditor.can().deleteRow() : false,
        canMergeCells: canProbeTable ? currentEditor.can().mergeCells() : false,
        canSplitCell: canProbeTable ? currentEditor.can().splitCell() : false,
        pageLayout: currentEditor ? getPageLayout(currentEditor.state) : defaultPageLayout,
        // `undo` refuses exactly when the history has no events to give back,
        // which is the number these read — without dry-running the command to
        // find it out.
        canRedo: currentEditor ? redoDepth(currentEditor.state) > 0 : false,
        canUndo: currentEditor ? undoDepth(currentEditor.state) > 0 : false,
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
      }
    },
  })
  const toolbarState = state ?? {
    blockLayout: defaultBlockLayout,
    canAddTableColumn: false,
    canAddTableRow: false,
    canDeleteTable: false,
    canDeleteTableColumn: false,
    canDeleteTableRow: false,
    canMergeCells: false,
    canSplitCell: false,
    pageLayout: defaultPageLayout,
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

      const toolbar = toolbarRef.current
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
    <div
      aria-label={t('editor.toolbar')}
      className="sn-editor-toolbar"
      ref={toolbarRef}
      role="toolbar"
    >
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

              if (!editor) return

              const chain = editor.chain().focus()

              if (fontFamily) chain.setFontFamily(fontFamily).run()
              else chain.unsetFontFamily().run()
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

              if (!editor) return

              const chain = editor.chain().focus()

              if (fontSize) chain.setFontSize(fontSize).run()
              else chain.unsetFontSize().run()
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
          onPress={() => editor?.chain().focus().toggleBold().run()}
          pressed={toolbarState.isBold}
        >
          <CompassIcon name="bold" />
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor}
          label={t('editor.italic')}
          onPress={() => editor?.chain().focus().toggleItalic().run()}
          pressed={toolbarState.isItalic}
        >
          <CompassIcon name="italic" />
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor}
          label={t('editor.strike')}
          onPress={() => editor?.chain().focus().toggleStrike().run()}
          pressed={toolbarState.isStrike}
        >
          <CompassIcon name="strikethrough" />
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor}
          label={t('editor.inlineCode')}
          onPress={() => editor?.chain().focus().toggleCode().run()}
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
              <span className="sn-editor-highlight-menu__label">{t('editor.marker')}</span>
              <div className="sn-editor-highlight-menu__swatches">
                {editorHighlightOptions.map((option) => (
                  <button
                    aria-label={t(option.labelKey)}
                    className="sn-editor-highlight-swatch"
                    data-active={toolbarState.highlightColor === option.color}
                    key={option.color}
                    onClick={() => {
                      editor?.chain().focus().setHighlight({ color: option.color }).run()
                      setIsHighlightMenuOpen(false)
                    }}
                    style={{ backgroundColor: option.color }}
                    title={t(option.labelKey)}
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
                {t('editor.markerClear')}
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
          onPress={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
          pressed={toolbarState.isHeading1}
        >
          <CompassIcon name="heading1" />
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor}
          label={t('editor.heading2')}
          onPress={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          pressed={toolbarState.isHeading2}
        >
          <CompassIcon name="heading2" />
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor}
          label={t('editor.blockquote')}
          onPress={() => editor?.chain().focus().toggleBlockquote().run()}
          pressed={toolbarState.isBlockquote}
        >
          <CompassIcon name="quote" />
        </ToolbarButton>
        {onInsertImage ? (
          <ToolbarButton
            disabled={!editor}
            label={t('editor.insertImage')}
            onPress={onInsertImage}
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
          onPress={() => editor?.chain().focus().toggleBulletList().run()}
          pressed={toolbarState.isBulletList}
        >
          <CompassIcon name="bulletList" />
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor}
          label={t('editor.orderedList')}
          onPress={() => editor?.chain().focus().toggleOrderedList().run()}
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
                    measure the other way. The narrow one asked for 74 and got
                    66 — the typographic ceiling — so it rendered identically to
                    normal while still highlighting as the active choice. It
                    asks for what it can have; the two now differ only in the
                    vertical margins, which is what is left to differ in once
                    the line is already as long as the design allows. */}
                {([
                  ['editor.marginNarrow', pageMeasureMax, 40, 80],
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
                  onPress={() => editor?.chain().focus().setHorizontalRule().run()}
                />
                <MenuButton
                  disabled={!editor || !onInsertImage}
                  icon={<CompassIcon name="image" />}
                  label={t('editor.insertImage')}
                  onPress={() => onInsertImage?.()}
                />
                <MenuButton
                  disabled={!editor || toolbarState.isTable}
                  icon={<CompassIcon name="table" />}
                  label={t('editor.insertTable')}
                  onPress={() =>
                    editor
                      ?.chain()
                      .focus()
                      .insertTable({ cols: 3, rows: 3, withHeaderRow: true })
                      .run()
                  }
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
                  onPress={() => editor?.chain().focus().addRowBefore().run()}
                />
                <MenuButton
                  disabled={!editor || !toolbarState.canAddTableRow}
                  icon={<UiIcon name="arrowDown" />}
                  label={t('editor.addRowAfter')}
                  onPress={() => editor?.chain().focus().addRowAfter().run()}
                />
                <MenuButton
                  disabled={!editor || !toolbarState.canDeleteTableRow}
                  icon={<UiIcon name="trash" />}
                  label={t('editor.deleteRow')}
                  onPress={() => editor?.chain().focus().deleteRow().run()}
                />
                <MenuButton
                  disabled={!editor || !toolbarState.isTable}
                  icon={<CompassIcon name="table" />}
                  label={t('editor.toggleHeaderRow')}
                  onPress={() => editor?.chain().focus().toggleHeaderRow().run()}
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
                  onPress={() => editor?.chain().focus().addColumnBefore().run()}
                />
                <MenuButton
                  disabled={!editor || !toolbarState.canAddTableColumn}
                  icon={<UiIcon name="chevronRight" />}
                  label={t('editor.addColumnAfter')}
                  onPress={() => editor?.chain().focus().addColumnAfter().run()}
                />
                <MenuButton
                  disabled={!editor || !toolbarState.canDeleteTableColumn}
                  icon={<UiIcon name="trash" />}
                  label={t('editor.deleteColumn')}
                  onPress={() => editor?.chain().focus().deleteColumn().run()}
                />
                <MenuButton
                  disabled={!editor || !toolbarState.isTable}
                  icon={<CompassIcon name="table" />}
                  label={t('editor.toggleHeaderColumn')}
                  onPress={() => editor?.chain().focus().toggleHeaderColumn().run()}
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
                  onPress={() => editor?.chain().focus().mergeCells().run()}
                />
                <MenuButton
                  disabled={!editor || !toolbarState.canSplitCell}
                  icon={<CompassIcon name="table" />}
                  label={t('editor.splitCell')}
                  onPress={() => editor?.chain().focus().splitCell().run()}
                />
                <MenuButton
                  disabled={!editor || toolbarState.isTable}
                  icon={<CompassIcon name="table" />}
                  label={t('editor.insertTable')}
                  onPress={() =>
                    editor
                      ?.chain()
                      .focus()
                      .insertTable({ cols: 3, rows: 3, withHeaderRow: true })
                      .run()
                  }
                />
                <MenuButton
                  disabled={!editor || !toolbarState.canDeleteTable}
                  icon={<UiIcon name="trash" />}
                  label={t('editor.deleteTable')}
                  onPress={() => editor?.chain().focus().deleteTable().run()}
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
          onPress={() => editor?.chain().focus().undo().run()}
        >
          <span className="sn-editor-tool-label">{t('editor.undo')}</span>
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor || !toolbarState.canRedo}
          label={t('editor.redo')}
          onPress={() => editor?.chain().focus().redo().run()}
        >
          <span className="sn-editor-tool-label">{t('editor.redo')}</span>
        </ToolbarButton>
      </div>
    </div>
  )
}
