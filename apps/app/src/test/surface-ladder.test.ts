/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(`${process.cwd()}/src/ui/styles/silicon-nostalgia.css`, 'utf8')

function token(name: string): string {
  const match = css.match(new RegExp(`${name}:\\s*([^;]+);`))
  if (!match) throw new Error(`Token ${name} is not defined in :root.`)
  return match[1].trim()
}

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

/** CIE L*, the perceptual lightness the surface ladder is specified in. */
function lstar(hex: string): number {
  const y = luminance(hex)
  return y > 0.008856 ? 116 * y ** (1 / 3) - 16 : 903.3 * y
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function alphaOf(rgba: string): number {
  const parts = rgba.match(/rgba?\(([^)]+)\)/)?.[1].split(',') ?? []
  return parts.length === 4 ? Number(parts[3]) : 1
}

describe('surface ladder', () => {
  it('keeps paper, panel and case a readable distance apart in L*', () => {
    const paper = lstar(token('--sn-paper-bg'))
    const panel = lstar(token('--sn-surface-solid'))
    const base = lstar(token('--sn-bg'))

    // The sheet must stay the lightest material, and each step wide enough to
    // read as a separate surface — the ladder used to be ~3 L* and looked flat.
    expect(paper).toBeGreaterThan(panel)
    expect(panel).toBeGreaterThan(base)
    expect(paper - panel).toBeGreaterThanOrEqual(5)
    expect(panel - base).toBeGreaterThanOrEqual(5)
  })

  it('keeps muted ink at AA against every chrome surface it can land on', () => {
    const surfaces = [
      token('--sn-paper-bg'),
      token('--sn-surface-solid'),
      token('--sn-surface-hover'),
      token('--sn-surface-muted'),
      token('--sn-bg'),
    ]

    for (const surface of surfaces) {
      expect(contrast(token('--sn-muted'), surface)).toBeGreaterThanOrEqual(4.5)
    }

    // Placeholder ink is deliberately lighter, and only ever sits on paper or
    // a panel — so it is held to those two rather than to the darker case.
    for (const surface of [token('--sn-paper-bg'), token('--sn-surface-solid')]) {
      expect(contrast(token('--sn-muted-2'), surface)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps panels near-opaque so a background image cannot wash their text out', () => {
    // A user background can be any picture at any opacity, which would void
    // every contrast figure above if panels let much of it through.
    expect(alphaOf(token('--sn-panel-bg'))).toBeGreaterThanOrEqual(0.9)
    expect(alphaOf(token('--sn-surface'))).toBeGreaterThanOrEqual(0.9)
  })

  it('gives the sheet an edge that survives a pale background image', () => {
    const paper = css.match(/\.sn-editor-paper \{[\s\S]*?\n\}/)?.[0] ?? ''

    expect(paper).toContain('border: 1px solid var(--sn-border)')
    // Hard offset, no blur: the native dialect, and it reads on a light case.
    expect(paper).toMatch(/box-shadow:\s*1px 1px 0/)
  })
})
