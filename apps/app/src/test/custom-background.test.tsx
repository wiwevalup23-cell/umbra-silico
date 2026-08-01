import 'fake-indexeddb/auto'
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BackgroundTooLargeError,
  clearCustomBackground,
  readCustomBackground,
  UnsupportedBackgroundError,
  writeCustomBackground,
} from '@/appearance'
import {
  allowedBackgroundImages,
  customBackgroundMaxBytes,
  customBackgroundValue,
} from '@/shared/backgrounds'
import { SettingsModal } from '@/ui/components/silicon/SettingsModal'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const cleanupTasks: Array<() => void> = []

function renderUi(children: ReactNode) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => root.render(children))

  return {
    container,
    cleanup() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

afterEach(async () => {
  while (cleanupTasks.length > 0) cleanupTasks.pop()?.()
  await clearCustomBackground()
})

const settings = {
  locale: 'en' as const,
  backgroundImage: null,
  backgroundOpacity: 55,
  backgroundPattern: 'grid' as const,
  inspectorWidth: 240,
  sidebarWidth: 260,
}

function customBackgroundProps(overrides: Partial<Parameters<typeof SettingsModal>[0]['customBackground']> = {}) {
  return {
    error: null,
    isBusy: false,
    onDismissError: vi.fn(),
    onRemove: vi.fn(),
    onUpload: vi.fn(),
    url: null,
    ...overrides,
  }
}

describe('custom background storage', () => {
  // jsdom's structured clone does not preserve Blob across fake-indexeddb, so
  // these assert the record around the payload rather than its bytes.
  it('round-trips the uploaded image through IndexedDB', async () => {
    const blob = new Blob(['pretend-pixels'], { type: 'image/png' })

    await writeCustomBackground(blob, 'wallpaper.png')
    const stored = await readCustomBackground()

    expect(stored).toMatchObject({
      byteSize: blob.size,
      mimeType: 'image/png',
      name: 'wallpaper.png',
    })
    expect(Date.parse(stored!.updatedAt)).not.toBeNaN()
  })

  it('keeps only the most recent image', async () => {
    await writeCustomBackground(new Blob(['first'], { type: 'image/png' }), 'a.png')
    await writeCustomBackground(
      new Blob(['second-image'], { type: 'image/webp' }),
      'b.webp',
    )

    const stored = await readCustomBackground()

    expect(stored).toMatchObject({ mimeType: 'image/webp', name: 'b.webp' })
  })

  it('reports nothing stored rather than throwing on a fresh profile', async () => {
    await expect(readCustomBackground()).resolves.toBeNull()
  })

  it('refuses a file that is not a displayable image', async () => {
    const notAnImage = new Blob(['# notes'], { type: 'text/markdown' })

    await expect(writeCustomBackground(notAnImage)).rejects.toBeInstanceOf(
      UnsupportedBackgroundError,
    )
    // The rejected upload must not have displaced an existing background.
    await expect(readCustomBackground()).resolves.toBeNull()
  })

  it('refuses an image past the size limit', async () => {
    const huge = new Blob([new Uint8Array(customBackgroundMaxBytes + 1)], {
      type: 'image/png',
    })

    await expect(writeCustomBackground(huge)).rejects.toBeInstanceOf(BackgroundTooLargeError)
  })

  it('accepts the custom sentinel as a valid stored background choice', () => {
    // Otherwise `normalizeSettings` would discard it on reload and the user's
    // own picture would silently revert to the plain grid.
    expect(allowedBackgroundImages.has(customBackgroundValue)).toBe(true)
  })
})

describe('settings dialog', () => {
  it('keeps every section reachable behind tabs', () => {
    const rendered = renderUi(
      <SettingsModal
        customBackground={customBackgroundProps()}
        dataSlot={<div data-testid="data-panel">backup</div>}
        onClose={vi.fn()}
        settings={settings}
        updateSetting={vi.fn()}
      />,
    )
    cleanupTasks.push(rendered.cleanup)

    const tabs = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('.sn-settings-tab'),
    )
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual([
      'Appearance',
      'Language',
      'Data',
    ])

    // The data panel used to render below an `overflow: hidden` surface, which
    // put backup and export permanently out of reach.
    expect(document.body.querySelector('[data-testid="data-panel"]')).toBeNull()
    act(() => tabs[2].click())
    expect(document.body.querySelector('[data-testid="data-panel"]')).not.toBeNull()

    act(() => tabs[1].click())
    expect(document.body.querySelectorAll('.sn-language-option').length).toBeGreaterThan(1)
  })

  it('offers upload when no image is stored and replace/remove once there is one', () => {
    const onUpload = vi.fn()
    const onRemove = vi.fn()
    const empty = renderUi(
      <SettingsModal
        customBackground={customBackgroundProps({ onUpload })}
        onClose={vi.fn()}
        settings={settings}
        updateSetting={vi.fn()}
      />,
    )
    cleanupTasks.push(empty.cleanup)

    expect(
      Array.from(document.body.querySelectorAll('.sn-custom-background__action')).map(
        (button) => button.textContent?.trim(),
      ),
    ).toEqual(['Upload image'])
    expect(document.body.querySelector('.sn-background-option--custom')).toBeNull()

    empty.cleanup()
    cleanupTasks.pop()

    const stored = renderUi(
      <SettingsModal
        customBackground={customBackgroundProps({
          onRemove,
          url: 'blob:custom-background',
        })}
        onClose={vi.fn()}
        settings={{ ...settings, backgroundImage: customBackgroundValue }}
        updateSetting={vi.fn()}
      />,
    )
    cleanupTasks.push(stored.cleanup)

    expect(
      Array.from(document.body.querySelectorAll('.sn-custom-background__action')).map(
        (button) => button.textContent?.trim(),
      ),
    ).toEqual(['Replace', 'Remove'])

    const swatch = document.body.querySelector('.sn-background-option--custom')
    expect(swatch?.getAttribute('aria-checked')).toBe('true')

    act(() =>
      document.body
        .querySelectorAll<HTMLButtonElement>('.sn-custom-background__action')[1]
        .click(),
    )
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('explains a rejected upload in the active language', () => {
    const rendered = renderUi(
      <SettingsModal
        customBackground={customBackgroundProps({ error: 'tooLarge' })}
        onClose={vi.fn()}
        settings={settings}
        updateSetting={vi.fn()}
      />,
    )
    cleanupTasks.push(rendered.cleanup)

    const alert = document.body.querySelector('.sn-settings-error')
    expect(alert?.textContent).toContain('20 MB')
  })
})
