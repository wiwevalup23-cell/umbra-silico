/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(`${process.cwd()}/src/ui/styles/silicon-nostalgia.css`, 'utf8')
const editorShell = readFileSync(
  `${process.cwd()}/src/ui/components/notes/EditorShell.tsx`,
  'utf8',
)
const printAt = css.indexOf('@media print')
const screenCss = printAt === -1 ? css : css.slice(0, printAt)

/**
 * Every rule that sets a width on the reading column, base and override.
 *
 * A declaration block holds no braces of its own, so `[^}]` stops at the right
 * one — matching to the next `\n}` would run past a rule nested in a media
 * query and pick up whatever followed it.
 */
function columnWidthDeclarations(): string[] {
  // Print is excluded: on paper the sheet size sets the measure, so there the
  // column is meant to fill the page box.
  return [...screenCss.matchAll(/\.sn-tiptap-prosemirror\s*\{([^}]*)\}/g)]
    .flatMap((rule) => [...rule[1].matchAll(/^\s*width:\s*([^;]+);/gm)])
    .map((match) => match[1].trim())
}

function lastRuleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matches = [...screenCss.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))]

  return matches.at(-1)?.[1] ?? ''
}

describe('reading measure (И1)', () => {
  it('caps the reading column in every rule that sizes it', () => {
    const widths = columnWidthDeclarations()

    expect(widths.length).toBeGreaterThan(0)

    // This has silently regressed three times: first a later rule replaced the
    // cap with `calc(100% - 60px)`, then with a plain `100%`. Either way the
    // column grew with the window until a line ran past 140 characters, while
    // the plan still claimed the measure was held. A width that sizes this
    // element has to carry a cap, not just fill its parent.
    for (const width of widths) {
      // Either a literal cap or the custom property carrying one.
      expect(width).toMatch(/\d+ch|--sn-page-measure/)
      expect(width).toMatch(/^min\(/)
    }
  })

  it('sets the type size, leading and measure the invariant is written in', () => {
    const base = css.match(/\.sn-tiptap-prosemirror \{[\s\S]*?\n\}/)?.[0] ?? ''

    expect(base).toContain('font-size: 20px')
    // 1.6 with a ~63-character Cyrillic line. The tighter the leading, the
    // shorter the line has to be for the eye to find the next one.
    expect(base).toContain('line-height: 1.6')
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
    expect(bodyPaper).toContain('padding: 0 var(--sn-editor-paper-inline) !important')
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
    expect(column).toContain('66ch')
    expect(column).toContain('max-width: 66ch !important')
    expect(column).toContain('margin-left: 0 !important')
    expect(column).toContain('margin-right: auto !important')
    expect(column).toContain('padding-left: 0 !important')
    expect(body).toContain('margin-left: 0 !important')
    expect(body).toContain('margin-right: auto !important')
    expect(body).toContain('text-align: left')
    expect(handle).toContain('position: absolute !important')
    expect(handle).toContain('right: -50px !important')
    expect(handle).toContain('left: auto !important')
    expect(handle).toContain('translateY(-50%)')
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

  it('does not apply the generic paragraph gap inside task items', () => {
    expect(screenCss).toMatch(
      /ul\[data-type="taskList"\] li > div > p\s*\{[^}]*margin:\s*0 !important;/,
    )
  })

  it('leaves a page whose margins grow downward, the way a page is set', () => {
    const header = Number(editorShell.match(/defaultPageHeaderOffset = (\d+)/)?.[1])
    const footer = Number(editorShell.match(/defaultPageFooterOffset = (\d+)/)?.[1])

    expect(header).toBeGreaterThan(0)
    // Equal top and bottom reads as sagging: the optical centre of a page sits
    // above its geometric centre, so the foot needs the greater margin.
    expect(footer).toBeGreaterThan(header)
  })

  it('offers a line-height ladder with no unusable rung and no duplicate step', () => {
    const ladder = editorShell
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
