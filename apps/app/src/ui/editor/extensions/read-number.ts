/**
 * A number, or `null` when there is not one.
 *
 * `Number('')` is `0`, and `0` is finite — so a missing value read out of the
 * DOM or a stored attribute passed for a real one and got clamped to the
 * nearest bound instead of falling back to the default. That is how every
 * paragraph pasted from anywhere ended up at the tightest line height on the
 * ladder: `element.style.lineHeight` is `''` on a plain `<p>`, and `''` became
 * zero, and zero clamped up to the minimum.
 *
 * An attribute that is not there is not a zero.
 */
export function readNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return null
  }

  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : null
}
