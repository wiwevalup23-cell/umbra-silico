import type { NoteRepository } from '@/repository/contracts'
import {
  type SyncReason,
  type SyncStatusSnapshot,
  syncStatusSnapshotSchema,
} from '@/shared/contracts'
import {
  processOutbox,
  type RetryPolicy,
  type SyncSleep,
} from '@/sync/outbox-processor'
import { applyRemoteChange, pullRemoteChanges } from '@/sync/remote-pull'
import {
  createRealtimeListener,
  type RealtimeListener,
} from '@/sync/realtime-listener'
import {
  createBrowserNetworkStateMonitor,
  type NetworkState,
  type NetworkStateMonitor,
  type NetworkStateUnsubscribe,
} from '@/sync/network-state'
import type { SupabaseRemoteGateway } from '@/sync/supabase'

export type SyncEngineUnsubscribe = () => void

export interface SyncEngine {
  start(): Promise<void>
  stop(): Promise<void>
  requestSync(reason: SyncReason): void
  getStatus(): SyncStatusSnapshot
  subscribe(listener: (status: SyncStatusSnapshot) => void): SyncEngineUnsubscribe
}

export type SyncEngineDependencies = {
  clock?: () => string
  noteRepository: NoteRepository
  outboxLimit?: number
  pullLimit?: number
  realtimeListener?: RealtimeListener
  remoteGateway: SupabaseRemoteGateway
  retryPolicy?: Partial<RetryPolicy>
  sleep?: SyncSleep
  networkState?: NetworkStateMonitor
}

const defaultClock = () => new Date().toISOString()

function isOnline(state: NetworkState): boolean {
  return state === 'online' || state === 'unknown'
}

function errorToString(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class DefaultSyncEngine implements SyncEngine {
  private readonly clock: () => string
  private readonly listeners = new Set<(status: SyncStatusSnapshot) => void>()
  private readonly networkState: NetworkStateMonitor
  private readonly noteRepository: NoteRepository
  private readonly outboxLimit: number
  private readonly pullLimit: number
  private readonly realtimeListener: RealtimeListener
  private readonly remoteGateway: SupabaseRemoteGateway
  private readonly retryPolicy?: Partial<RetryPolicy>
  private readonly sleep?: SyncSleep
  private networkUnsubscribe: NetworkStateUnsubscribe | null = null
  private pendingSyncReason: SyncReason | null = null
  private realtimeUnsubscribe: SyncEngineUnsubscribe | null = null
  private running = false
  private syncing = false
  private status: SyncStatusSnapshot = syncStatusSnapshotSchema.parse({
    lastError: null,
    lastSyncedAt: null,
    pendingOperations: 0,
    status: 'idle',
  })

  constructor(dependencies: SyncEngineDependencies) {
    this.clock = dependencies.clock ?? defaultClock
    this.networkState = dependencies.networkState ?? createBrowserNetworkStateMonitor()
    this.noteRepository = dependencies.noteRepository
    this.outboxLimit = dependencies.outboxLimit ?? 50
    this.pullLimit = dependencies.pullLimit ?? 500
    this.remoteGateway = dependencies.remoteGateway
    this.realtimeListener =
      dependencies.realtimeListener ??
      createRealtimeListener({ remoteGateway: dependencies.remoteGateway })
    this.retryPolicy = dependencies.retryPolicy
    this.sleep = dependencies.sleep
  }

  async start(): Promise<void> {
    if (this.running) {
      return
    }

    this.running = true
    this.networkUnsubscribe = this.networkState.subscribe((state) => {
      void this.handleNetworkChange(state)
    })

    try {
      await this.refreshPendingOperations()

      if (!isOnline(this.networkState.getState())) {
        this.setStatus({
          lastError: null,
          status: 'offline',
        })
        return
      }

      this.ensureRealtimeSubscription()
      this.requestSync('startup')
    } catch (error) {
      this.setStatus({
        lastError: errorToString(error),
        status: 'error',
      })
    }
  }

  async stop(): Promise<void> {
    this.running = false
    this.pendingSyncReason = null
    this.networkUnsubscribe?.()
    this.networkUnsubscribe = null
    this.realtimeUnsubscribe?.()
    this.realtimeUnsubscribe = null
    await this.refreshPendingOperations()
    this.setStatus({
      lastError: null,
      status: 'idle',
    })
  }

  requestSync(reason: SyncReason): void {
    if (!this.running) {
      return
    }

    if (!isOnline(this.networkState.getState())) {
      this.setStatus({
        lastError: null,
        status: 'offline',
      })
      return
    }

    if (this.syncing) {
      this.pendingSyncReason = reason
      return
    }

    void this.runSync()
  }

  getStatus(): SyncStatusSnapshot {
    return this.status
  }

  subscribe(listener: (status: SyncStatusSnapshot) => void): SyncEngineUnsubscribe {
    this.listeners.add(listener)
    listener(this.status)

    return () => {
      this.listeners.delete(listener)
    }
  }

  private async handleNetworkChange(state: NetworkState): Promise<void> {
    if (!this.running) {
      return
    }

    if (!isOnline(state)) {
      this.realtimeUnsubscribe?.()
      this.realtimeUnsubscribe = null
      await this.refreshPendingOperations()
      this.setStatus({
        lastError: null,
        status: 'offline',
      })
      return
    }

    this.ensureRealtimeSubscription()
    this.requestSync('network-online')
  }

  private ensureRealtimeSubscription(): void {
    if (this.realtimeUnsubscribe || !this.running || !isOnline(this.networkState.getState())) {
      return
    }

    this.realtimeUnsubscribe = this.realtimeListener.subscribe((change) => {
      void this.handleRealtimeChange(change)
    })
  }

  private async handleRealtimeChange(
    change: Parameters<RealtimeListener['subscribe']>[0] extends (
      value: infer TValue,
    ) => void
      ? TValue
      : never,
  ): Promise<void> {
    if (!this.running || !isOnline(this.networkState.getState())) {
      return
    }

    try {
      const result = await applyRemoteChange({
        change,
        clock: this.clock,
        noteRepository: this.noteRepository,
      })

      await this.refreshPendingOperations()

      if (result === 'conflict') {
        this.setStatus({
          lastError: null,
          status: 'conflict',
        })
      } else {
        this.setStatus({
          lastError: null,
          lastSyncedAt: this.clock(),
          status: 'idle',
        })
      }
    } catch (error) {
      this.setStatus({
        lastError: errorToString(error),
        status: 'error',
      })
    }
  }

  private async runSync(): Promise<void> {
    if (!this.running || this.syncing) {
      return
    }

    this.syncing = true
    this.setStatus({
      lastError: null,
      status: 'syncing',
    })

    try {
      const outboxResult = await processOutbox({
        limit: this.outboxLimit,
        noteRepository: this.noteRepository,
        remoteGateway: this.remoteGateway,
        retryPolicy: this.retryPolicy,
        sleep: this.sleep,
      })
      const lastRevision = await this.noteRepository.getLastServerRevision()
      const pullResult = await pullRemoteChanges({
        clock: this.clock,
        limit: this.pullLimit,
        noteRepository: this.noteRepository,
        remoteGateway: this.remoteGateway,
        sinceRevision: lastRevision,
      })

      await this.refreshPendingOperations()

      if (outboxResult.failed.length > 0) {
        this.setStatus({
          lastError: `${outboxResult.failed.length} outbox operation(s) failed.`,
          status: 'error',
        })
      } else if (pullResult.conflicts > 0) {
        this.setStatus({
          lastError: null,
          lastSyncedAt: this.clock(),
          status: 'conflict',
        })
      } else {
        this.setStatus({
          lastError: null,
          lastSyncedAt: this.clock(),
          status: 'idle',
        })
      }
    } catch (error) {
      await this.refreshPendingOperations()
      this.setStatus({
        lastError: errorToString(error),
        status: 'error',
      })
    } finally {
      this.syncing = false

      if (this.pendingSyncReason) {
        const nextReason = this.pendingSyncReason
        this.pendingSyncReason = null
        this.requestSync(nextReason)
      }
    }
  }

  private async refreshPendingOperations(): Promise<void> {
    const pendingOperations = await this.noteRepository.getPendingOps(this.outboxLimit)
    this.setStatus({
      pendingOperations: pendingOperations.length,
    })
  }

  private setStatus(patch: Partial<SyncStatusSnapshot>): void {
    this.status = syncStatusSnapshotSchema.parse({
      ...this.status,
      ...patch,
    })

    for (const listener of this.listeners) {
      listener(this.status)
    }
  }
}

export function createSyncEngine(dependencies: SyncEngineDependencies): SyncEngine {
  return new DefaultSyncEngine(dependencies)
}
