import type { LiveQuery, Unsubscribe } from '@/repository/contracts'

/**
 * What a live query reads, so a mutation can refresh only the queries it can
 * actually have changed. `note:<id>` is per-note; the rest are collection-wide.
 */
export type LiveQueryTag = 'notes' | 'trash' | 'folders' | `note:${string}`

export type RefreshableLiveQuery = {
  refresh(): Promise<void>
}

/**
 * Reduces a snapshot to a string that changes exactly when the snapshot is
 * meaningfully different. Callers supply a cheap one for payloads that are
 * expensive to serialize, such as a note carrying a multi-megabyte document.
 */
export type LiveQuerySignature<TValue> = (value: TValue) => string

export class StoreBackedLiveQuery<TValue> implements LiveQuery<TValue> {
  readonly tags: ReadonlySet<LiveQueryTag>

  private readonly listeners = new Set<() => void>()
  private readonly loadSnapshot: () => Promise<TValue>
  private readonly signature: LiveQuerySignature<TValue>
  private readonly onDispose: (query: StoreBackedLiveQuery<TValue>) => void
  private readonly onRetain: (query: StoreBackedLiveQuery<TValue>) => void
  private snapshot: TValue
  // Holding the current snapshot's signature means a refresh serializes only
  // the incoming value; the old implementation re-serialized both sides.
  private snapshotSignature: string
  private disposed = false

  constructor(options: {
    initialSnapshot: TValue
    loadSnapshot: () => Promise<TValue>
    onDispose?: (query: StoreBackedLiveQuery<TValue>) => void
    onRetain?: (query: StoreBackedLiveQuery<TValue>) => void
    signature?: LiveQuerySignature<TValue>
    tags: Iterable<LiveQueryTag>
  }) {
    this.loadSnapshot = options.loadSnapshot
    this.signature = options.signature ?? ((value) => JSON.stringify(value) ?? '')
    this.onDispose = options.onDispose ?? (() => undefined)
    this.onRetain = options.onRetain ?? (() => undefined)
    this.snapshot = options.initialSnapshot
    this.snapshotSignature = this.signature(options.initialSnapshot)
    this.tags = new Set(options.tags)
    void this.refresh()
  }

  getSnapshot(): TValue {
    return this.snapshot
  }

  subscribe(listener: () => void): Unsubscribe {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  dispose(): void {
    if (this.disposed) {
      return
    }

    this.disposed = true
    this.listeners.clear()
    this.onDispose(this)
  }

  retain(): void {
    if (!this.disposed) {
      return
    }

    this.disposed = false
    this.onRetain(this)
    // The store may have moved on while this query was released.
    void this.refresh()
  }

  async refresh(): Promise<void> {
    if (this.disposed) {
      return
    }

    const nextSnapshot = await this.loadSnapshot()
    const nextSignature = this.signature(nextSnapshot)

    // A dispose that landed while the snapshot was loading has to win,
    // otherwise a released query would still notify listeners it dropped.
    if (this.disposed || nextSignature === this.snapshotSignature) {
      return
    }

    this.snapshot = nextSnapshot
    this.snapshotSignature = nextSignature
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}

/**
 * Holds the live queries a repository is currently serving and refreshes only
 * those whose tags a mutation touched.
 */
export class LiveQueryRegistry {
  private readonly queries = new Set<StoreBackedLiveQuery<never>>()

  get size(): number {
    return this.queries.size
  }

  register<TValue>(query: StoreBackedLiveQuery<TValue>): void {
    this.queries.add(query as unknown as StoreBackedLiveQuery<never>)
  }

  unregister<TValue>(query: StoreBackedLiveQuery<TValue>): void {
    this.queries.delete(query as unknown as StoreBackedLiveQuery<never>)
  }

  async invalidate(tags: Iterable<LiveQueryTag>): Promise<void> {
    const changed = tags instanceof Set ? tags : new Set(tags)
    const affected: RefreshableLiveQuery[] = []

    for (const query of this.queries) {
      for (const tag of query.tags) {
        if (changed.has(tag)) {
          affected.push(query)
          break
        }
      }
    }

    await Promise.all(affected.map((query) => query.refresh()))
  }

  async refreshAll(): Promise<void> {
    await Promise.all([...this.queries].map((query) => query.refresh()))
  }
}

/** Cheap, collision-free signature for a note list rendered by the UI. */
export function noteListSignature(
  items: ReadonlyArray<{
    id: string
    isLocked: boolean
    parentFolderId: string | null
    preview: string
    propertyStatus?: string
    syncStatus: string
    tags?: string[]
    title: string
    updatedAt: string
  }>,
): string {
  let signature = `${items.length}`

  for (const item of items) {
    signature += `\u0000${item.id}\u0001${item.updatedAt}\u0001${item.syncStatus}\u0001${
      item.isLocked ? 1 : 0
    }\u0001${item.parentFolderId ?? ''}\u0001${item.title}\u0001${item.preview}\u0001${
      item.propertyStatus ?? ''
    }\u0001${item.tags?.join('\u0002') ?? ''}`
  }

  return signature
}
