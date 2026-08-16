/**
 * Where a menu that hangs off the toolbar gets drawn.
 *
 * The toolbar is a horizontal scroller, and a scroller clips whatever its
 * children open *outwards*: a menu placed inside it is invisible and
 * unclickable however right its offsets are. So both toolbar menus are drawn
 * into `document.body` and positioned against the viewport instead, from the
 * measured rectangles of the control they belong to and of the toolbar row
 * they hang from.
 *
 * Kept apart from the component because placement is arithmetic, and
 * arithmetic can be checked without a browser.
 */

/** The part of a `DOMRect` placement actually reads. */
export type AnchoredMenuRect = {
  bottom: number
  left: number
  right: number
  top: number
}

export type AnchoredMenuOptions = {
  /** Which edge of the anchor the menu lines up with. */
  align: 'end' | 'start'
  /** The control the menu belongs to; it fixes the horizontal position. */
  anchor: AnchoredMenuRect
  /** The row the menu hangs from. The menu clears it rather than covering it. */
  bar: AnchoredMenuRect
  /** Height the menu would take if nothing constrained it. */
  contentHeight: number
  /** Tallest the menu may be before it scrolls internally. */
  maxHeight: number
  /** Widest the menu may be before the viewport narrows it. */
  maxWidth: number
  viewport: { height: number; width: number }
}

export type AnchoredMenuPlacement = {
  left: number
  maxHeight: number
  /** True when the menu was flipped above the bar for want of room below. */
  opensAbove: boolean
  top: number
  width: number
}

/** Breathing room kept between the menu and the edge of the window. */
const viewportMargin = 12

/** The gap between the toolbar row and the menu hanging off it. */
const barGap = 8

/**
 * Below this the space under the bar is a sliver, and a menu squeezed into it
 * reads as broken even though every pixel of it is technically on screen.
 */
const flipThreshold = 280

export function placeAnchoredMenu({
  align,
  anchor,
  bar,
  contentHeight,
  maxHeight,
  maxWidth,
  viewport,
}: AnchoredMenuOptions): AnchoredMenuPlacement {
  const width = Math.min(maxWidth, viewport.width - viewportMargin * 2)

  const alignedLeft = align === 'end' ? anchor.right - width : anchor.left
  const left = Math.min(
    viewport.width - width - viewportMargin,
    Math.max(viewportMargin, alignedLeft),
  )

  const height = Math.min(contentHeight, maxHeight)
  const spaceBelow = viewport.height - bar.bottom - viewportMargin - barGap
  const spaceAbove = bar.top - viewportMargin - barGap

  // Flipping is only an improvement when the other side is actually roomier;
  // otherwise the menu jumps above the bar to be squeezed even harder.
  const opensAbove =
    spaceBelow < Math.min(height, flipThreshold) && spaceAbove > spaceBelow

  const top = opensAbove
    ? Math.max(viewportMargin, bar.top - height - barGap)
    : bar.bottom + barGap

  return {
    left,
    maxHeight: opensAbove
      ? Math.min(maxHeight, spaceAbove)
      : Math.min(maxHeight, viewport.height - top - viewportMargin),
    opensAbove,
    top,
    width,
  }
}
