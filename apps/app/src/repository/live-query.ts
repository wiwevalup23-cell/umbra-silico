import type { LiveQuery, Unsubscribe } from '@/repository/contracts'

export class StoreBackedLiveQuery<TValue> implements LiveQuery<TValue> {
  private readonly listeners = new Set<() => void>()
  private readonly loadSnapshot: () => Promise<TValue>
  private readonly areEqual: (left: TValue, right: TValue) => boolean
  private snapshot: TValue

  constructor(
    initialSnapshot: TValue,
    loadSnapshot: () => Promise<TValue>,
    areEqual: (left: TValue, right: TValue) => boolean = Object.is,
  ) {
    this.loadSnapshot = loadSnapshot
    this.areEqual = areEqual
    this.snapshot = initialSnapshot
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

  async refresh(): Promise<void> {
    const nextSnapshot = await this.loadSnapshot()

    if (this.areEqual(this.snapshot, nextSnapshot)) {
      return
    }

    this.snapshot = nextSnapshot
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}

export type RefreshableLiveQuery = {
  refresh(): Promise<void>
}
