/// <reference types="node" />

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { SquircleButton } from '@/ui/components/silicon/SquircleButton'
import { Icon } from '@/ui/icons/umbra'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const cleanupTasks: Array<() => void> = []
const testDirectory = dirname(fileURLToPath(import.meta.url))
const assetDirectory = join(testDirectory, '../ui/icons/umbra/assets/interface-24')

function render(element: ReactNode) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => root.render(element))

  cleanupTasks.push(() => {
    act(() => root.unmount())
    container.remove()
  })

  return container
}

afterEach(() => {
  while (cleanupTasks.length) cleanupTasks.pop()?.()
})

describe('Umbra production icon system', () => {
  it('renders interface icons from a native 24 px grid', () => {
    const container = render(<Icon name="search" />)
    const svg = container.querySelector('svg')

    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg?.getAttribute('stroke-width')).toBe('1.6')
    expect(svg?.querySelectorAll('path')).toHaveLength(2)
  })

  it('keeps the superellipse frame separate from its functional glyph', () => {
    const container = render(
      <SquircleButton aria-label="New note" icon="newDocument" size="large" variant="primary" />,
    )
    const button = container.querySelector('button')

    expect(button?.classList.contains('sn-squircle-button')).toBe(true)
    expect(button?.dataset.size).toBe('large')
    expect(button?.dataset.variant).toBe('primary')
    expect(button?.querySelectorAll('.sn-squircle-button__frame path')).toHaveLength(2)
    expect(button?.querySelector('.sn-squircle-button__icon')?.getAttribute('viewBox'))
      .toBe('0 0 24 24')
  })

  it('ships every declared interface-24 SVG as a standalone asset', () => {
    const manifest = JSON.parse(readFileSync(join(assetDirectory, 'manifest.json'), 'utf8')) as {
      icons: string[]
      viewBox: string
    }

    expect(manifest.viewBox).toBe('0 0 24 24')
    expect(manifest.icons.length).toBeGreaterThanOrEqual(20)

    for (const name of manifest.icons) {
      const path = join(assetDirectory, `${name}.svg`)
      expect(existsSync(path), `${name}.svg is missing`).toBe(true)
      expect(readFileSync(path, 'utf8')).toContain('viewBox="0 0 24 24"')
    }
  })
})
