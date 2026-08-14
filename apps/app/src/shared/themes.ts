/**
 * Colour themes.
 *
 * The warm Platinum theme is the product and the default. It lives in :root in
 * silicon-nostalgia.css and is expressed here as the *absence* of an override —
 * selecting it removes `data-theme` from the document rather than setting it to
 * anything, so the default path stays exactly the CSS that shipped.
 *
 * Names are proper names, like the background presets, so they stay out of the
 * dictionary: i18n.test.ts fails a key whose en and ru values are identical.
 */
export type ThemeName = 'platinum' | 'lilac' | 'crt'

export const DEFAULT_THEME: ThemeName = 'platinum'

/**
 * Offered in settings. Listing a theme here is what makes it selectable;
 * anything absent fails isThemeName() and falls back to Platinum, so a stored
 * value from an older build self-heals rather than leaving the document
 * half-styled.
 */
export const themeOptions = [
  { label: 'Platinum', value: 'platinum' },
  { label: 'Lilac Platinum', value: 'lilac' },
  { label: 'CRT Room', value: 'crt' },
] as const satisfies ReadonlyArray<{ label: string; value: ThemeName }>

export const allowedThemes = new Set<ThemeName>(themeOptions.map((option) => option.value))

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === 'string' && allowedThemes.has(value as ThemeName)
}

/**
 * Marks the frame in which the palette is being swapped. Two jobs:
 *
 *  1. A swap should be instant. Without this, every element carrying a
 *     `transition` on colour cross-fades for its own duration, and the app
 *     spends ~140ms as a smear of two palettes.
 *
 *  2. It works around a real invalidation bug. When a property's value comes
 *     from a custom property *and* that property is transitioned, changing the
 *     custom property does not re-resolve the element: it keeps the old colour
 *     until some unrelated recalc happens. Measured on .sn-settings-tab, which
 *     stayed at the warm --sn-muted (#656158, 2.49:1 on the dark case) after
 *     switching to CRT, while --sn-muted on that very element already read
 *     #A9A3B2. Setting `transition: none` on it snapped it to the right value.
 */
const SWITCHING_ATTRIBUTE = 'data-theme-switching'

/**
 * The default theme is the stylesheet's own :root, so it is applied by taking
 * the attribute off rather than by naming it.
 */
export function applyTheme(root: HTMLElement, theme: ThemeName): void {
  root.setAttribute(SWITCHING_ATTRIBUTE, '')

  if (theme === DEFAULT_THEME) {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', theme)
  }

  // Reading a layout property forces the new palette to resolve now, while
  // transitions are still suppressed. Without this the attribute would come
  // back off in the same frame and nothing would have been recalculated.
  void root.offsetHeight

  // requestAnimationFrame alone is not enough: it does not fire while the tab
  // is not being painted, and the attribute would stick — leaving every
  // transition in the app disabled for the rest of the session. The timeout is
  // the guarantee; rAF is the fast path when the page is visible.
  let done = false
  const restore = () => {
    if (done) return
    done = true
    root.removeAttribute(SWITCHING_ATTRIBUTE)
  }

  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(restore)
  setTimeout(restore, 120)
}
