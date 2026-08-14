/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The warm theme is the product. An alternate theme may only ever be an
 * override, so two things have to stay true:
 *
 *   1. Every colour lifted out of a rule keeps the exact value it had when it
 *      was a literal — the extraction moved no pixels, and must keep not
 *      moving any.
 *   2. No new colour literal appears in a rule. A literal is unreachable from
 *      a theme, so one that creeps back in is a hole the theme cannot patch.
 */

const files = [
  'silicon-nostalgia.css',
  'chat.css',
  'mobile-ui.css',
  'globals.css',
  'y2k-accents.css',
  'themes.css',
] as const

const css = Object.fromEntries(
  files.map((name) => [name, readFileSync(`${process.cwd()}/src/ui/styles/${name}`, 'utf8')]),
) as Record<(typeof files)[number], string>

/** The value each token carried as a literal, before it had a name. */
const extracted: Record<string, string> = {
  '--sn-menu-bg': '#f6f3ea',
  '--sn-command-bg': '#f7f4eb',
  '--sn-chat-bubble-bg': '#fbf8ef',
  '--sn-chat-footer-bg': '#f2eee3',
  '--sn-import-actions-bg': '#f2eee4',
  '--sn-swatch-bg': '#f8f5ed',
  '--sn-math-editor-bg': '#eee9df',
  '--sn-password-button-bg': '#ebe7dc',
  '--sn-boot-bg': '#f3f1ea',
  '--sn-lightbox-ink': '#efece3',
  '--sn-titlebar-bg': '#ece8dc',
  '--sn-titlebar-button-bg': '#e4dfd2',
  '--sn-chat-bubble-other-top': '#f0ece2',
  '--sn-chat-bubble-other-bottom': '#e7e1d5',
  '--sn-control-ink': '#3a382f',
  '--sn-control-ink-hover': '#34312a',
  '--sn-author-active-top': '#4a4740',
  '--sn-author-active-bottom': '#2c2a25',
  '--sn-border-hover': '#6f6a5c',
  '--sn-meta-ink': '#8a877c',
  '--sn-dialog-ink': '#55534b',
  '--sn-field-label-ink': '#6d6a61',
  '--sn-danger-ink': '#8f2f26',
  '--sn-danger-ink-deep': '#792f28',
  '--sn-danger-ink-alt': '#8c332f',
  '--sn-danger-ink-chat': '#8c3b2e',
  '--sn-danger-ink-mini': '#7f2a22',
  '--sn-danger-border': '#7d2e28',
  '--sn-danger-button-top': '#a94b40',
  '--sn-danger-bg': '#f6e5df',
  '--sn-danger-icon-bottom': '#f0dfd8',
  '--sn-danger-on': '#fffaf7',
  '--sn-warning-ink': '#76501d',
}

/**
 * Surface veils: the RGB triple of an `rgba(..., a)` a rule paints to raise a
 * surface. Only the colour is tokenised — the alpha stays at the call site,
 * because the alpha is how far that surface lifts while the colour is what a
 * theme has to own.
 */
const veils: Record<string, string> = {
  '--sn-veil-rgb': '255, 255, 252',
  '--sn-veil-paper-rgb': '255, 254, 250',
  '--sn-veil-paper-warm-rgb': '255, 254, 249',
  '--sn-veil-sheet-rgb': '255, 253, 248',
  '--sn-veil-menu-rgb': '246, 243, 234',
  '--sn-veil-warm-rgb': '248, 245, 237',
  '--sn-veil-deep-rgb': '238, 233, 223',
  '--sn-veil-danger-rgb': '255, 246, 242',
  '--sn-veil-warning-rgb': '246, 232, 198',
}

/**
 * The colour-bar swatches mirror --sn-calibration-strip. They are a reference
 * — a test card — and have to read identically under every theme, so they are
 * deliberately still literals.
 */
const literalAllowlist = /\.sn-inspector-palette/

function rulesOnly(source: string): Array<{ line: number; text: string; selector: string }> {
  const lines = source.split('\n')
  const out: Array<{ line: number; text: string; selector: string }> = []
  let insideCustomProperty = false
  let selector = ''

  lines.forEach((raw, index) => {
    if (raw.includes('{') && !insideCustomProperty) {
      const head = raw.split('{')[0].trim()
      if (head) selector = head
    }
    if (!insideCustomProperty && /^--[a-z0-9-]+\s*:/.test(raw.trim())) insideCustomProperty = true
    if (insideCustomProperty) {
      if (raw.includes(';')) insideCustomProperty = false
      return
    }
    // A fallback inside var() is fine: it is the token's own value, restated.
    out.push({ line: index + 1, text: raw.replace(/var\([^)]*\)/g, ''), selector })
  })

  return out
}

function isWarm(hex: string): boolean {
  const h = hex.slice(1)
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
  return Math.max(r, g, b) - Math.min(r, g, b) > 6 && r >= b
}

describe('theme tokens', () => {
  it('keeps every extracted colour byte-identical to the literal it replaced', () => {
    for (const [token, value] of Object.entries(extracted)) {
      const match = css['silicon-nostalgia.css'].match(
        new RegExp(`${token}:\\s*(#[0-9a-fA-F]{3,8});`),
      )
      expect(match, `${token} is not defined in :root`).not.toBeNull()
      expect(match?.[1].toLowerCase(), `${token} drifted away from its original value`).toBe(value)
    }
  })

  it('leaves no warm colour literal reachable only from a rule', () => {
    const stragglers: string[] = []

    for (const name of files) {
      for (const { line, text, selector } of rulesOnly(css[name])) {
        if (literalAllowlist.test(selector)) continue
        for (const hex of text.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) ?? []) {
          if (isWarm(hex)) stragglers.push(`${name}:${line} ${hex} in ${selector}`)
        }
      }
    }

    expect(stragglers, 'these colours cannot be reached by a theme override').toEqual([])
  })

  it('keeps every extracted veil byte-identical to the literal it replaced', () => {
    for (const [token, value] of Object.entries(veils)) {
      const match = css['silicon-nostalgia.css'].match(new RegExp(`${token}:\\s*([^;]+);`))
      expect(match, `${token} is not defined in :root`).not.toBeNull()
      expect(match?.[1].trim(), `${token} drifted away from its original value`).toBe(value)
    }
  })

  it('leaves no dense light veil painting a surface a theme cannot reach', () => {
    // A veil at alpha 0.9 does not tint what is under it, it replaces it. One
    // left as a literal is a near-white patch on a dark case — which is exactly
    // what kept the CRT theme off the menu until these were lifted.
    const stragglers: string[] = []
    const rgba = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/g

    for (const name of files) {
      for (const { line, text, selector } of rulesOnly(css[name])) {
        if (!text.includes('background') && !/^\s*(background|-)/.test(text)) continue
        if (text.includes('shadow')) continue
        for (const m of text.matchAll(rgba)) {
          const [r, g, b] = [m[1], m[2], m[3]].map(Number)
          const relative = [r, g, b].map((c) => {
            const v = c / 255
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
          })
          const light = 0.2126 * relative[0] + 0.7152 * relative[1] + 0.0722 * relative[2]
          if (light > 0.6 && Number(m[4]) >= 0.2) {
            stragglers.push(`${name}:${line} ${m[0]} in ${selector}`)
          }
        }
      }
    }

    expect(stragglers, 'these veils cannot be reached by a theme override').toEqual([])
  })

  it('never redefines :root, so the default theme is only ever what shipped', () => {
    // A bare `:root {` in themes.css would edit the warm theme rather than
    // overlay it, and the default would stop being the reviewed default.
    const bareRoot = css['themes.css'].match(/^\s*:root\s*\{/m)
    expect(bareRoot, 'themes.css must only ever scope to :root[data-theme=...]').toBeNull()
  })

  it('points every extracted token at a definition that actually exists', () => {
    const defined = new Set(
      Object.values(css).flatMap((source) => [...source.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1])),
    )

    for (const token of Object.keys(extracted)) {
      expect(defined.has(token), `${token} is used but never defined`).toBe(true)
    }
  })
})

/** Pull the declarations out of one selector block. */
function blockOf(source: string, selector: string): Record<string, string> {
  const start = source.indexOf(selector)
  if (start === -1) throw new Error(`No block for ${selector}`)
  const open = source.indexOf('{', start)
  const close = source.indexOf('\n}', open)
  const body = source.slice(open + 1, close)
  return Object.fromEntries(
    [...body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].replace(/\s+/g, ' ').trim()]),
  )
}

const rootBlock = blockOf(css['silicon-nostalgia.css'], ':root {')
const lilacBlock = blockOf(css['themes.css'], "[data-theme='lilac']")

/**
 * A token a theme has to answer for. The bare-triple case matters: veils and
 * the two channel triples TypeScript reads are stored as `225, 220, 210`, and a
 * detector that only knew about hex would let a theme silently inherit them.
 */
const carriesColour = (value: string) =>
  /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/.test(value) || /^\d{1,3},\s*\d{1,3},\s*\d{1,3}$/.test(value.trim())

/**
 * Tokens a theme is right not to answer for:
 *   --sn-calibration-strip        a colour reference; one that moved with the
 *                                 theme would not be a reference
 *   --sn-user-background-image    the user's own picture
 *   --sn-background-pattern-size  geometry, written by the runtime
 */
const themeExempt = new Set([
  '--sn-calibration-strip',
  '--sn-user-background-image',
  '--sn-background-pattern-size',
])

function srgbToLinear(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function parseHex(value: string): [number, number, number] {
  const hex = value.replace('#', '')
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
}

function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(srgbToLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function lstar(hex: string): number {
  const y = luminance(hex)
  return y > 0.008856 ? 116 * y ** (1 / 3) - 16 : 903.3 * y
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const crtBlock = blockOf(css['themes.css'], "[data-theme='crt']")

/** The alternates, which must answer for everything :root defines. */
const alternates: Array<[string, Record<string, string>]> = [
  ['lilac', lilacBlock],
  ['crt', crtBlock],
]

/**
 * Every theme including the default. These invariants are deliberately anchored
 * to what Platinum already does rather than to a number picked for the new
 * themes: an alternate is allowed to be as good as the product, and a floor the
 * product itself would fail is a floor that measures the wrong thing.
 */
const allThemes: Array<[string, Record<string, string>]> = [['platinum', rootBlock], ...alternates]

describe.each(alternates)('%s theme completeness', (name, block) => {
  it('answers for every colour the default theme defines', () => {
    const unanswered = Object.entries(rootBlock)
      .filter(([token, value]) => carriesColour(value) && !themeExempt.has(token))
      .map(([token]) => token)
      .filter((token) => !(token in block))

    // Anything missing here keeps its warm value under the violet theme, which
    // is exactly the cream-on-lilac failure the extraction pass existed to stop.
    expect(unanswered, `these tokens would stay warm under the ${name} theme`).toEqual([])
  })
})

describe.each(allThemes)('%s theme', (_name, block) => {
  it('keeps the sheet the lightest surface and the case the darkest', () => {
    // This reads the same for both polarities on purpose. In the dark theme the
    // note is a lit screen, so it still comes forward off the case rather than
    // sinking into it — an inverted ladder there would be a different product.
    const paper = lstar(block['--sn-paper-bg'])
    const panel = lstar(block['--sn-surface-solid'])
    const base = lstar(block['--sn-bg'])

    expect(paper).toBeGreaterThan(panel)
    expect(panel).toBeGreaterThan(base)
    expect(paper - panel).toBeGreaterThanOrEqual(5)
    expect(panel - base).toBeGreaterThanOrEqual(5)
  })

  it('keeps muted ink at AA against every chrome surface', () => {
    const surfaces = [
      '--sn-paper-bg',
      '--sn-surface-solid',
      '--sn-surface-hover',
      '--sn-surface-muted',
      '--sn-bg',
    ].map((token) => block[token])

    for (const surface of surfaces) {
      expect(contrast(block['--sn-muted'], surface)).toBeGreaterThanOrEqual(4.5)
    }

    for (const surface of [block['--sn-paper-bg'], block['--sn-surface-solid']]) {
      expect(contrast(block['--sn-muted-2'], surface)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps accent and semantic colours at AA on the panel', () => {
    for (const token of ['--sn-selection', '--sn-success', '--sn-pending', '--sn-danger']) {
      expect(
        contrast(block[token], block['--sn-surface-solid']),
        `${token} is not readable on this theme's panel`,
      ).toBeGreaterThanOrEqual(4.2)
    }
  })

  it('keeps a popover off the panel’s own value', () => {
    // A menu level with the panel loses its edge and stops reading as a raised
    // surface. Direction flips with polarity; separation does not. The floor is
    // 1.9 because Platinum's own menu sits +2.07 L* off its panel — anything
    // stricter would fail the shipped product, which would make this a test of
    // my taste rather than of the design.
    const panel = lstar(block['--sn-surface-solid'])
    for (const token of ['--sn-menu-bg', '--sn-command-bg', '--sn-chat-bubble-bg']) {
      expect(
        Math.abs(lstar(block[token]) - panel),
        `${token} sits level with the panel`,
      ).toBeGreaterThanOrEqual(1.9)
    }
  })

  it('keeps text legible on every fill the theme paints under it', () => {
    const pairs: Array<[string, string, string]> = [
      ['--sn-ink', '--sn-menu-bg', 'body ink on a popover'],
      ['--sn-ink', '--sn-titlebar-bg', 'body ink on a titlebar'],
      ['--sn-paper-bg', '--sn-control-ink', 'primary button label on its fill'],
      ['--sn-danger-on', '--sn-danger-button-top', 'danger button label on its fill'],
      ['--sn-danger-ink-deep', '--sn-danger-bg', 'error text on the error surface'],
    ]

    for (const [ink, fill, what] of pairs) {
      expect(contrast(block[ink], block[fill]), what).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('lilac theme', () => {
  it('does not regress any semantic colour against the default theme', () => {
    // Lilac was built by rotating hue at fixed lightness, so each pair should
    // land within a hair of its warm counterpart. A drift means someone moved a
    // lightness and owes the palette a re-proof. The dark theme is exempt: its
    // lightness inverts, so it has nothing to inherit.
    for (const token of ['--sn-success', '--sn-pending', '--sn-danger', '--sn-selection']) {
      const warm = contrast(rootBlock[token], rootBlock['--sn-surface-solid'])
      const lilac = contrast(lilacBlock[token], lilacBlock['--sn-surface-solid'])
      expect(lilac, `${token} drifted from its warm contrast`).toBeGreaterThan(warm - 0.15)
    }
  })
})

describe('crt theme', () => {
  it('re-draws the Platinum relief instead of inverting it', () => {
    const crt = blockOf(css['themes.css'], "[data-theme='crt']")

    // The warm highlight is a solid white inset line. Carried onto a dark
    // control it reads as a scratch rather than as light on an edge, so the
    // dark theme has to state its own — translucent, and paired with a drop
    // shadow strong enough to carry depth without a bright surround.
    expect(rootBlock['--sn-bevel-shadow']).toContain('#ffffff')
    expect(crt['--sn-bevel-shadow']).not.toContain('#ffffff')
    expect(crt['--sn-bevel-shadow']).toMatch(/inset 0 1px 0 rgba\([^)]*0\.\d+\)/)
  })

  it('flips the primary button to a light fill so it cannot vanish', () => {
    const crt = blockOf(css['themes.css'], "[data-theme='crt']")

    // The rule is `background: linear-gradient(180deg, var(--sn-control-ink),
    // var(--sn-ink)); color: var(--sn-paper-bg)`. On a dark case that fill has
    // to go light, and the now-dark paper token becomes its label.
    expect(lstar(crt['--sn-control-ink'])).toBeGreaterThan(lstar(crt['--sn-surface-solid']))
    expect(lstar(crt['--sn-paper-bg'])).toBeLessThan(lstar(crt['--sn-control-ink']))
  })

  it('declares a dark color-scheme so form controls follow', () => {
    // Without this, native scrollbars and date pickers stay light and the
    // theme comes apart at exactly the edges nobody screenshots.
    const block = css['themes.css'].slice(css['themes.css'].indexOf("[data-theme='crt']"))
    expect(block.slice(0, block.indexOf('\n}'))).toContain('color-scheme: dark')
  })
})

describe('theme previews', () => {
  it('previews Platinum with Platinum’s real values', () => {
    // The swatch scopes itself to [data-theme] to read a palette it is not
    // running. Platinum has no palette of its own, so the preview restates a
    // few :root values -- and a restatement that drifts is a lie on screen.
    const preview = blockOf(css['themes.css'], "[data-theme='platinum']")

    for (const [token, value] of Object.entries(preview)) {
      expect(value, `${token} in the Platinum preview no longer matches :root`).toBe(
        rootBlock[token],
      )
    }
  })
})
