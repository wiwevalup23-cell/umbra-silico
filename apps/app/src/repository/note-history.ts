/** All retention needs to know about an operation. */
export type RetainableOp = {
  opId: string
  createdAt: string
}

const hourMs = 60 * 60 * 1000
const dayMs = 24 * hourMs

export type NoteHistoryRetentionPolicy = {
  /** Every version newer than this is kept. */
  denseWindowMs: number
  /** Between denseWindow and here, one version per hour survives. */
  hourlyWindowMs: number
  /** Between hourlyWindow and here, one version per day survives. */
  dailyWindowMs: number
}

export const defaultNoteHistoryRetention: NoteHistoryRetentionPolicy = {
  denseWindowMs: dayMs,
  hourlyWindowMs: 7 * dayMs,
  dailyWindowMs: 30 * dayMs,
}

function bucketOf(ageMs: number, policy: NoteHistoryRetentionPolicy): string | null {
  if (ageMs <= policy.denseWindowMs) {
    return null
  }

  if (ageMs <= policy.hourlyWindowMs) {
    return `h${Math.floor(ageMs / hourMs)}`
  }

  if (ageMs <= policy.dailyWindowMs) {
    return `d${Math.floor(ageMs / dayMs)}`
  }

  return 'expired'
}

/**
 * Picks the operations to drop so a note's history thins out with age instead
 * of growing without bound.
 *
 * Every operation carries a full note snapshot, which is what makes both the
 * pruning and the restore safe: keeping a sparser set of snapshots loses
 * intermediate states but never corrupts the ones that remain, and the newest
 * operation is always kept so a pending outbox still pushes current state.
 */
export function selectExpiredNoteOps(
  ops: readonly RetainableOp[],
  now: string,
  policy: NoteHistoryRetentionPolicy = defaultNoteHistoryRetention,
): string[] {
  if (ops.length <= 1) {
    return []
  }

  const nowMs = Date.parse(now)
  const ordered = [...ops].sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
  )
  const keptBuckets = new Set<string>()
  const expired: string[] = []

  ordered.forEach((op, index) => {
    // The newest snapshot is the note's current state as far as sync is
    // concerned, so it is never a candidate.
    if (index === 0) {
      return
    }

    const bucket = bucketOf(Math.max(0, nowMs - Date.parse(op.createdAt)), policy)

    if (bucket === null) {
      return
    }

    if (bucket === 'expired' || keptBuckets.has(bucket)) {
      expired.push(op.opId)
      return
    }

    keptBuckets.add(bucket)
  })

  return expired
}
