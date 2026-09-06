/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { NoteDocument } from '@/shared/contracts/document'
import { normalizeEditorContent } from '@/ui/editor/document-content'

const css = readFileSync(`${process.cwd()}/src/ui/styles/silicon-nostalgia.css`, 'utf8')
const mobileCss = readFileSync(`${process.cwd()}/src/ui/styles/mobile-ui.css`, 'utf8')
const pageLayout = readFileSync(
  `${process.cwd()}/src/ui/editor/extensions/page-layout.ts`,
  'utf8',
)
const editorToolbar = readFileSync(
  `${process.cwd()}/src/ui/editor/toolbar/EditorToolbar.tsx`,
  'utf8',
)
const printAt = css.indexOf('@media print')
const screenCss = printAt === -1 ? css : css.slice(0, printAt)

/** Every screen rule that sizes the editable body. */
function contentWidthDeclarations(): string[] {
  return [...screenCss.matchAll(/\.sn-tiptap-prosemirror\s*\{([^}]*)\}/g)]
    .flatMap((rule) => [...rule[1].matchAll(/^\s*width:\s*([^;]+);/gm)])
    .map((match) => match[1].trim())
}

function lastRuleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matches = [...screenCss.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))]

  return matches.at(-1)?.[1] ?? ''
}

describe('page layout policy', () => {
  it('starts with a useful symmetric page margin', () => {
    expect(pageLayout).toContain('const pageSideMarginMin = 48')
    expect(pageLayout).toContain('const pageSideMarginMax = 96')
    expect(pageLayout).toContain('const defaultPageSideMargin = 64')
    expect(pageLayout).toContain('const currentPageLayoutVersion = 3')
  })

  it('replaces every legacy line-width layout, including the stuck v2 value', () => {
    const legacy: NoteDocument = {
      schemaVersion: 1,
      editor: 'tiptap',
      content: {
        type: 'doc',
        attrs: {
          pageFooterOffset: 104,
          pageHeaderOffset: 72,
          pageMeasure: 66,
        },
        content: [{ type: 'paragraph' }],
      },
    }
    const intentional: NoteDocument = {
      ...legacy,
      content: {
        ...legacy.content,
        attrs: {
          ...legacy.content.attrs,
          pageMeasure: 66,
          pageMeasureVersion: 2,
        },
      },
    }

    for (const document of [legacy, intentional]) {
      const attrs = normalizeEditorContent(document).attrs

      expect(attrs).toMatchObject({
        pageFooterOffset: 104,
        pageHeaderOffset: 72,
        pageLayoutVersion: 3,
        pageSideMargin: 64,
      })
      expect(attrs).not.toHaveProperty('pageMeasure')
      expect(attrs).not.toHaveProperty('pageMeasureVersion')
    }
  })

  it('lets the editable body fill all space between the two page margins', () => {
    const widths = contentWidthDeclarations()

    expect(widths.length).toBeGreaterThan(0)
    for (const width of widths) {
      expect(width).toMatch(/^100%(?: !important)?$/)
    }
    expect(screenCss).not.toContain('--sn-page-measure')
    expect(screenCss).not.toMatch(/max-width:\s*\d+ch/)
  })

  it('sets a readable default type size and leading', () => {
    const base = css.match(/\.sn-tiptap-prosemirror \{[\s\S]*?\n\}/)?.[0] ?? ''

    expect(css).toContain('--sn-editor-body-size: 20px')
    expect(base).toContain('font-size: var(--sn-editor-body-size)')
    expect(base).toContain('line-height: 1.6')
  })

  it('applies horizontal space once, at the paper boundary', () => {
    const paper = lastRuleBody('.sn-editor-paper')
    const column = lastRuleBody('.sn-editor-reading-column')
    const content = lastRuleBody('.sn-editor-reading-column > .sn-editor-content')
    const body = lastRuleBody('.sn-tiptap-prosemirror')

    expect(paper).toContain('padding: 0 var(--sn-page-effective-side-margin) !important')
    for (const inner of [column, content, body]) {
      const horizontalLonghands = [
        ...inner.matchAll(/padding-(?:left|right):\s*([^;]+)/g),
      ].map((match) => match[1].trim())

      for (const value of horizontalLonghands) {
        expect(value).toMatch(/^0(?:px)?(?: !important)?$/)
      }
    }
  })

  it('keeps a physical sheet centred with one symmetric desk inset', () => {
    const desk = lastRuleBody('.sn-editor-panel')
    const sheet = lastRuleBody('.sn-editor-paper-sheet')

    expect(desk).toContain('display: flex !important')
    expect(desk).toContain('flex-direction: column !important')
    expect(desk).toContain('align-items: center !important')
    expect(desk).toContain('overflow-y: auto !important')
    expect(desk).toContain('height: 100% !important')
    expect(desk).toContain('container-name: editor-desk')
    expect(desk).toContain('container-type: inline-size')

    expect(sheet).toContain('max-width: var(--sn-editor-paper-max-width) !important')
    expect(screenCss).toMatch(
      /@media \(min-width: 960px\)[\s\S]*?\.sn-editor-panel\s*\{[^}]*padding: var\(--sn-editor-desk-inset\) !important/,
    )
    expect(sheet).toContain('width: 100% !important')
    expect(sheet).toContain('min-height: 100% !important')
    expect(sheet).toContain('margin: 0 auto !important')
    expect(sheet).toContain('padding: 0 !important')
    expect(sheet).not.toContain('aspect-ratio')
    expect(screenCss).toMatch(
      /\.sn-workspace\[data-focus="true"\] \.sn-editor-shell\s*\{[^}]*max-width: var\(--sn-editor-paper-max-width\)/,
    )
  })

  it('uses one paper axis without escape-width or negative-margin compensation', () => {
    const sheet = lastRuleBody('.sn-editor-paper-sheet')
    const header = lastRuleBody('.sn-editor-paper-sheet > .sn-editor-topbar')
    const toolbar = lastRuleBody('.sn-editor-toolbar')
    const bodyPaper = lastRuleBody('.sn-editor-paper')

    expect(header).toContain('var(--sn-editor-paper-inline)')
    expect(header).toContain('var(--sn-editor-title-gutter)')
    expect(toolbar).toContain('width: 100% !important')
    expect(header).toContain('var(--sn-editor-paper-header-block)')
    expect(toolbar).toContain('min-height: 46px !important')
    expect(toolbar).toContain('padding: 8px var(--sn-editor-paper-inline) !important')
    expect(toolbar).toContain('margin: 0 !important')
    expect(sheet).toContain('--sn-page-effective-side-margin: var(')
    expect(sheet).toContain('var(--sn-page-side-margin, 64px)')
    expect(bodyPaper).toContain('padding: 0 var(--sn-page-effective-side-margin) !important')
    expect(screenCss).toMatch(
      /\.sn-editor-title-group\s*\{[^}]*margin-left: 0 !important/,
    )
    expect(screenCss).toMatch(
      /@container editor-desk \(min-width: 860px\)[\s\S]*?grid-template-areas: "title status actions"/,
    )
    expect(screenCss).toMatch(
      /@container editor-desk \(min-width: 440px\) and \(max-width: 859px\)[\s\S]*?"title actions"[\s\S]*?"status status"/,
    )
    expect(screenCss).not.toContain('width: calc(100% + 128px) !important')
    expect(screenCss).not.toContain('margin: 0 0 0 -64px !important')
    expect(screenCss).not.toContain('margin-left: -46px !important')
  })

  it('aligns title and body left while hanging the handle from the column', () => {
    const column = lastRuleBody('.sn-editor-reading-column')
    const body = lastRuleBody('.sn-tiptap-prosemirror')
    const handle = lastRuleBody('.sn-block-handle')

    expect(column).toContain('position: relative !important')
    expect(column).toContain('width: 100% !important')
    expect(column).toContain('max-width: none !important')
    expect(column).toContain('margin: 0 !important')
    expect(column).toContain('padding: 0 !important')
    expect(body).toContain('width: 100% !important')
    expect(body).toContain('max-width: none !important')
    expect(body).toContain('margin: 0 !important')
    expect(body).toContain('text-align: left')
    expect(handle).toContain('position: absolute !important')
    expect(handle).toContain('right: auto !important')
    expect(handle).toContain('left: calc(100% + 6px) !important')
    expect(handle).toContain('translateY(-50%)')
  })

  it('renders every supported value exactly on mobile too', () => {
    expect(css).not.toContain('18%')
    expect(mobileCss).toContain('var(--sn-page-header-offset, 56px)')
    expect(mobileCss).toContain('var(--sn-page-footer-offset, 88px) !important')
    expect(mobileCss).not.toContain('max(28px, var(--sn-page-header-offset')
    expect(mobileCss).not.toContain('max(88px, var(--sn-page-footer-offset')
  })

  it('keeps collapse tooltips local to their live panel button', () => {
    const button = lastRuleBody('.sn-panel-collapse-button')
    const tooltip =
      screenCss.match(/\.sn-panel-collapse-button::after\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(button).toContain('position: relative !important')
    expect(tooltip).toContain('position: absolute !important')
    expect(tooltip).toContain('opacity: 0 !important')
    expect(tooltip).toContain('visibility: hidden !important')
    expect(screenCss).toContain('> .sn-library-panel')
    expect(screenCss).toContain('> .sn-inspector-panel')
  })

  it('keeps the complete toolbar on one horizontally scrollable row', () => {
    const toolbar = lastRuleBody('.sn-editor-toolbar')

    expect(toolbar).toContain('display: flex !important')
    expect(toolbar).toContain('flex-wrap: nowrap !important')
    expect(toolbar).toContain('overflow-x: auto !important')
    expect(toolbar).toContain('align-items: center !important')
    expect(toolbar).toContain('border-bottom: 1px solid')
  })

  it('keeps the toolbar on screen while the sheet scrolls under it', () => {
    const toolbar = lastRuleBody('.sn-editor-toolbar')

    // Left in the flow, the toolbar scrolled away with the paper, and every
    // tool went with it — including the marker palette anchored to it.
    expect(toolbar).toContain('position: sticky !important')
    // The paper belongs to the sheet behind, so a transparent bar would have
    // the text run visibly through it.
    expect(toolbar).toContain('background-color: var(--sn-paper-bg) !important')
    // Above the compact library and inspector panels, below the modal scrim.
    expect(toolbar).toMatch(/z-index: (4[1-9]|[5-9]\d|1\d\d|2[01]\d) !important/)

    // A scroller clips at its padding box, so a bar stuck to the content edge
    // leaves the desk's inset above it for the text to slide through. The
    // offset that cancels it is declared beside the padding it answers to.
    expect(toolbar).toContain('top: var(--sn-editor-toolbar-stick, 0px) !important')
    expect(screenCss).toMatch(
      /@media \(min-width: 960px\)[\s\S]*?\.sn-editor-panel\s*\{[^}]*--sn-editor-toolbar-stick: calc\(var\(--sn-editor-desk-inset\) \* -1\)/,
    )
  })

  it('hangs the marker palette outside the toolbar that would clip it', () => {
    const palette = lastRuleBody('.sn-editor-highlight-menu')

    // `position: absolute` put it inside a horizontal scroller, which clipped
    // it away whole: the button opened nothing at any scroll offset.
    expect(palette).toContain('position: fixed')
    expect(palette).not.toContain('position: absolute')
  })

  it('does not apply the generic paragraph gap inside task items', () => {
    expect(screenCss).toMatch(
      /ul\[data-type="taskList"\] li > div > p\s*\{[^}]*margin:\s*0 !important;/,
    )
  })

  it('leaves a page whose margins grow downward, the way a page is set', () => {
    const header = Number(pageLayout.match(/defaultPageHeaderOffset = (\d+)/)?.[1])
    const footer = Number(pageLayout.match(/defaultPageFooterOffset = (\d+)/)?.[1])

    expect(header).toBeGreaterThan(0)
    // Equal top and bottom reads as sagging: the optical centre of a page sits
    // above its geometric centre, so the foot needs the greater margin.
    expect(footer).toBeGreaterThan(header)
  })

  it('offers a line-height ladder with no unusable rung and no duplicate step', () => {
    const ladder = editorToolbar
      .match(/\{\[([\d., ]+)\]\.map\(\(lineHeight\)/)?.[1]
      .split(',')
      .map((value) => Number(value.trim()))

    expect(ladder).toBeDefined()
    const steps = ladder as number[]

    // 1.0 sets body lines touching, and the old ladder spent a rung on 1.45
    // beside 1.5 — three per cent apart, which no eye resolves.
    expect(Math.min(...steps)).toBeGreaterThan(1)
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i] - steps[i - 1]).toBeGreaterThanOrEqual(0.15)
    }
  })
})
