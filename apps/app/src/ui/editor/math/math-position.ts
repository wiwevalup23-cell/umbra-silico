import type { Transaction } from '@tiptap/pm/state'

/**
 * Where a formula has moved to after a change, or `null` once it is gone.
 *
 * The equation panel is not modal: it opens on a click and the document stays
 * editable underneath, so the position it was opened with goes stale the
 * moment anything above the formula changes length. `updateBlockMath` checks
 * the node it finds and refuses if it is not a formula, so a stale position
 * does not corrupt a neighbour — it does nothing at all, and the edit the user
 * typed and confirmed is dropped without a word. Following the change is what
 * keeps the panel pointed at the formula it was opened on.
 */
export function remapMathPosition(
  position: number,
  transaction: Transaction,
): number | null {
  // Default association maps a node position past content inserted in front
  // of it, which is where the node itself has moved to.
  const mapped = transaction.mapping.mapResult(position)

  return mapped.deleted ? null : mapped.pos
}
