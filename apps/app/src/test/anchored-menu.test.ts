import { describe, expect, it } from 'vitest'
import {
  placeAnchoredMenu,
  type AnchoredMenuOptions,
} from '@/ui/editor/toolbar/anchored-menu'

/** A toolbar sitting at the top of a roomy window, and a small menu on it. */
function options(overrides: Partial<AnchoredMenuOptions> = {}): AnchoredMenuOptions {
  return {
    align: 'start',
    anchor: { bottom: 170, left: 400, right: 440, top: 124 },
    bar: { bottom: 170, left: 300, right: 900, top: 124 },
    contentHeight: 107,
    maxHeight: 320,
    maxWidth: 196,
    viewport: { height: 900, width: 1440 },
    ...overrides,
  }
}

describe('placing a menu that hangs off the toolbar', () => {
  it('hangs the menu under the bar, not under the button', () => {
    // The button is inside a row of tools; a menu that cleared only the button
    // would cut across the rest of the row.
    const placement = placeAnchoredMenu(
      options({ anchor: { bottom: 160, left: 400, right: 440, top: 134 } }),
    )

    expect(placement.top).toBe(178)
    expect(placement.opensAbove).toBe(false)
  })

  it('lines the menu up with the edge of its own control', () => {
    expect(placeAnchoredMenu(options()).left).toBe(400)
    expect(placeAnchoredMenu(options({ align: 'end' })).left).toBe(440 - 196)
  })

  it('keeps the menu inside the window when its control sits at the edge', () => {
    const atRightEdge = placeAnchoredMenu(
      options({ anchor: { bottom: 170, left: 1400, right: 1436, top: 124 } }),
    )

    expect(atRightEdge.left).toBe(1440 - 196 - 12)

    const atLeftEdge = placeAnchoredMenu(
      options({ align: 'end', anchor: { bottom: 170, left: 4, right: 40, top: 124 } }),
    )

    expect(atLeftEdge.left).toBe(12)
  })

  it('narrows the menu on a window too small to hold it', () => {
    const placement = placeAnchoredMenu(
      options({ maxWidth: 440, viewport: { height: 720, width: 380 } }),
    )

    expect(placement.width).toBe(380 - 24)
    expect(placement.left).toBe(12)
  })

  it('flips above the bar when the room below is a sliver', () => {
    // A toolbar near the bottom of a short window: 60px underneath it.
    const placement = placeAnchoredMenu(
      options({
        bar: { bottom: 640, left: 300, right: 900, top: 594 },
        viewport: { height: 720, width: 1440 },
      }),
    )

    expect(placement.opensAbove).toBe(true)
    expect(placement.top).toBe(594 - 107 - 8)
  })

  it('stays below when flipping would only squeeze it harder', () => {
    // 80px above the bar against 150px below it. The old rule compared the
    // bar's own offset with the room underneath and flipped into the tighter
    // side; what matters is which side is actually roomier.
    const placement = placeAnchoredMenu(
      options({
        bar: { bottom: 146, left: 300, right: 900, top: 100 },
        contentHeight: 300,
        viewport: { height: 320, width: 1440 },
      }),
    )

    expect(placement.opensAbove).toBe(false)
    expect(placement.top).toBe(154)
  })

  it('gives the menu no more height than the side it opened into', () => {
    const below = placeAnchoredMenu(
      options({
        bar: { bottom: 400, left: 300, right: 900, top: 354 },
        contentHeight: 600,
        maxHeight: 680,
        viewport: { height: 720, width: 1440 },
      }),
    )

    expect(below.top).toBe(408)
    expect(below.maxHeight).toBe(720 - 408 - 12)

    const above = placeAnchoredMenu(
      options({
        bar: { bottom: 660, left: 300, right: 900, top: 614 },
        contentHeight: 600,
        maxHeight: 680,
        viewport: { height: 720, width: 1440 },
      }),
    )

    expect(above.opensAbove).toBe(true)
    expect(above.maxHeight).toBe(614 - 12 - 8)
  })
})
