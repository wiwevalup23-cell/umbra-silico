import { describe, expect, it } from 'vitest'
import type { LiveQuery, NoteRepository } from '@/repository/contracts'
import { mapLocalNoteToSyncPayload } from '@/repository/mappers/local-note-mapper'
import { mapRemoteChangeToLocalNote } from '@/repository/mappers/remote-note-mapper'
import {
  createDraftLocalNote,
  deviceIdSchema,
  documentV1Contract,
  noteIdSchema,
  operationIdSchema,
  userIdSchema,
  type ConflictRecord,
  type LocalNote,
  type NoteDetail,
  type NoteId,
  type NoteListItem,
  type RemoteNoteChange,
  type SyncOperation,
} from '@/shared/contracts'
import { DefaultSyncEngine } from '@/sync'
import type {
  NetworkState,
  NetworkStateMonitor,
  NetworkStateUnsubscribe,
} from '@/sync/network-state'
import type {
  SupabaseRemoteGateway,
  SupabaseRemoteGatewayUnsubscribe,
} from '@/sync/supabase'

const userId = userIdSchema.parse('sync_user')
const localDeviceId = deviceIdSchema.parse('sync_local_device')
const remoteDeviceId = deviceIdSchema.parse('sync_remote_device')
const noteId = noteIdSchema.parse('note_sync_1')
const now = '2026-07-05T13:00:00.000Z'

function createDocument(text: string) {
  return {
    ...documentV1Contract.createEmpty(),
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text }],
        },
      ],
    },
  }
}

function makeNote(
  id: NoteId,
  title: string,
  body: string,
  syncStatus: LocalNote['syncStatus'] = 'dirty',
): LocalNote {
  return {
    ...createDraftLocalNote({
      deviceId: localDeviceId,
      document: createDocument(body),
      id,
      now,
      title,
      userId,
    }),
    lastOpId: operationIdSchema.parse(`op_${id}`),
    localRevision: 1,
    preview: body,
    syncStatus,
  }
}

function makeOperation(note: LocalNote): SyncOperation {
  return {
    attemptCount: 0,
    baseRemoteRevision: note.baseRemoteRevision,
    createdAt: note.updatedAt,
    deviceId: note.deviceId,
    lastError: null,
    noteId: note.id,
    opId: note.lastOpId ?? operationIdSchema.parse(`op_${note.id}`),
    payload: mapLocalNoteToSyncPayload(note),
    status: 'pending',
    type: 'note.update',
    userId: note.userId,
  }
}

function makeRemoteChange(
  note: LocalNote,
  serverRevision: number,
  changedByDeviceId = remoteDeviceId,
): RemoteNoteChange {
  return {
    changedByDeviceId,
    noteId: note.id,
    payload: mapLocalNoteToSyncPayload(note),
    serverRevision,
  }
}

function toListItem(note: LocalNote): NoteListItem {
  return {
    id: note.id,
    isLocked: note.isLocked,
    parentFolderId: note.parentFolderId,
    preview: note.preview ?? '',
    syncStatus: note.syncStatus,
    title: note.isLocked ? 'Locked note' : note.title,
    updatedAt: note.updatedAt,
  }
}

function createStaticLiveQuery<TValue>(value: TValue): LiveQuery<TValue> {
  return {
    getSnapshot: () => value,
    subscribe: () => () => undefined,
  }
}

async function waitFor(assertion: () => void): Promise<void> {
  let lastError: unknown = null

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
    }
  }

  throw lastError
}

class ManualNetworkStateMonitor implements NetworkStateMonitor {
  private readonly listeners = new Set<(state: NetworkState) => void>()
  private state: NetworkState

  constructor(state: NetworkState) {
    this.state = state
  }

  getState(): NetworkState {
    return this.state
  }

  setState(state: NetworkState): void {
    this.state = state

    for (const listener of this.listeners) {
      listener(state)
    }
  }

  subscribe(listener: (state: NetworkState) => void): NetworkStateUnsubscribe {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }
}

class MemoryNoteRepository implements NoteRepository {
  readonly appliedChanges: RemoteNoteChange[] = []
  readonly conflicts: ConflictRecord[] = []
  readonly conflictCopies: LocalNote[] = []
  readonly failedOps: string[] = []
  private lastServerRevision = 0
  private readonly notes = new Map<NoteId, LocalNote>()
  private readonly operations: SyncOperation[] = []

  constructor(notes: LocalNote[] = [], operations: SyncOperation[] = []) {
    for (const note of notes) {
      this.notes.set(note.id, note)
    }

    this.operations.push(...operations)
  }

  liveNoteList(): LiveQuery<NoteListItem[]> {
    return createStaticLiveQuery([...this.notes.values()].map(toListItem))
  }

  liveTrashList(): LiveQuery<NoteListItem[]> {
    return createStaticLiveQuery([])
  }

  liveFolderTree() {
    return createStaticLiveQuery([])
  }

  liveNote(noteId: NoteId): LiveQuery<NoteDetail | null> {
    return createStaticLiveQuery(this.notes.get(noteId) ?? null)
  }

  async getNote(id: NoteId): Promise<NoteDetail | null> {
    return this.notes.get(id) ?? null
  }

  async createNote(): Promise<NoteId> {
    throw new Error('Not implemented in sync engine tests.')
  }

  async createFolder(): Promise<never> {
    throw new Error('Not implemented in sync engine tests.')
  }

  async deleteFolder(): Promise<void> {
    throw new Error('Not implemented in sync engine tests.')
  }

  async moveFolder(): Promise<void> {
    throw new Error('Not implemented in sync engine tests.')
  }

  async moveNoteToFolder(): Promise<void> {
    throw new Error('Not implemented in sync engine tests.')
  }

  async renameFolder(): Promise<void> {
    throw new Error('Not implemented in sync engine tests.')
  }

  async updateNote(): Promise<void> {
    throw new Error('Not implemented in sync engine tests.')
  }

  async deleteNote(): Promise<void> {
    throw new Error('Not implemented in sync engine tests.')
  }

  async purgeNote(): Promise<void> {
    throw new Error('Not implemented in sync engine tests.')
  }

  async restoreNote(): Promise<void> {
    throw new Error('Not implemented in sync engine tests.')
  }

  async lockNote(): Promise<void> {
    throw new Error('Not implemented in sync engine tests.')
  }

  async unlockNoteForSession(): Promise<never> {
    throw new Error('Not implemented in sync engine tests.')
  }

  async getPendingOps(limit: number): Promise<SyncOperation[]> {
    return this.operations.filter((operation) => operation.status === 'pending').slice(0, limit)
  }

  async getLastServerRevision(): Promise<number> {
    return this.lastServerRevision
  }

  async markOpSynced(opId: string, remoteRevision: number): Promise<void> {
    const operation = this.operations.find((candidate) => candidate.opId === opId)

    if (operation) {
      operation.status = 'synced'
    }

    await this.setLastServerRevision(remoteRevision)
  }

  async markOpFailed(opId: string, error: string): Promise<void> {
    const operation = this.operations.find((candidate) => candidate.opId === opId)

    if (operation) {
      operation.status = 'failed'
      operation.lastError = error
      operation.attemptCount += 1
    }

    this.failedOps.push(opId)
  }

  async setLastServerRevision(remoteRevision: number): Promise<void> {
    this.lastServerRevision = Math.max(this.lastServerRevision, remoteRevision)
  }

  async applyRemoteChange(change: RemoteNoteChange): Promise<void> {
    this.appliedChanges.push(change)
    this.notes.set(change.noteId, mapRemoteChangeToLocalNote(change))
    await this.setLastServerRevision(change.serverRevision)
  }

  async markConflict(
    noteId: NoteId,
    conflict: ConflictRecord,
    remoteChange?: RemoteNoteChange,
  ): Promise<void> {
    const note = this.notes.get(noteId)

    if (note) {
      this.notes.set(noteId, {
        ...note,
        syncStatus: 'conflict',
      })
    }

    if (remoteChange) {
      const remoteNote = mapRemoteChangeToLocalNote(remoteChange)
      const copyId = noteIdSchema.parse(
        `note_conflict_copy_${this.conflictCopies.length + 1}`,
      )
      const conflictCopy: LocalNote = remoteNote.isLocked
        ? {
            ...remoteNote,
            id: copyId,
            deviceId: localDeviceId,
            localRevision: 0,
            remoteRevision: null,
            baseRemoteRevision: null,
            syncStatus: 'synced',
            lastOpId: null,
          }
        : {
            ...remoteNote,
            id: copyId,
            deviceId: localDeviceId,
            localRevision: 0,
            remoteRevision: null,
            baseRemoteRevision: null,
            syncStatus: 'synced',
            lastOpId: null,
            title: `${remoteNote.title} (Conflict copy)`,
          }

      this.notes.set(conflictCopy.id, conflictCopy)
      this.conflictCopies.push(conflictCopy)
    }

    this.conflicts.push(conflict)
  }
}

class FakeRemoteGateway implements SupabaseRemoteGateway {
  readonly pushedOperations: SyncOperation[] = []
  pullRequests: Array<{ limit?: number; serverRevision: number }> = []
  pushFailuresRemaining = 0
  pushRevision = 10
  private readonly listeners = new Set<(change: RemoteNoteChange) => void>()
  private readonly remoteChanges: RemoteNoteChange[]

  constructor(remoteChanges: RemoteNoteChange[] = []) {
    this.remoteChanges = remoteChanges
  }

  async pullSince(serverRevision: number, limit?: number): Promise<RemoteNoteChange[]> {
    this.pullRequests.push({ limit, serverRevision })
    return this.remoteChanges.filter((change) => change.serverRevision > serverRevision)
  }

  async pushOperation(operation: SyncOperation): Promise<number> {
    this.pushedOperations.push(operation)

    if (this.pushFailuresRemaining > 0) {
      this.pushFailuresRemaining -= 1
      throw new Error('temporary remote failure')
    }

    return this.pushRevision
  }

  subscribeToChanges(
    onChange: (change: RemoteNoteChange) => void,
  ): SupabaseRemoteGatewayUnsubscribe {
    this.listeners.add(onChange)

    return () => {
      this.listeners.delete(onChange)
    }
  }

  emit(change: RemoteNoteChange): void {
    for (const listener of this.listeners) {
      listener(change)
    }
  }

  listenerCount(): number {
    return this.listeners.size
  }
}

describe('DefaultSyncEngine', () => {
  it('sleeps offline, then pushes durable outbox operations after reconnect', async () => {
    const note = makeNote(noteId, 'Offline draft', 'Local text')
    const operation = makeOperation(note)
    const repository = new MemoryNoteRepository([note], [operation])
    const remoteGateway = new FakeRemoteGateway()
    const networkState = new ManualNetworkStateMonitor('offline')
    const engine = new DefaultSyncEngine({
      clock: () => now,
      networkState,
      noteRepository: repository,
      remoteGateway,
      sleep: async () => undefined,
    })

    await engine.start()

    expect(engine.getStatus()).toMatchObject({
      pendingOperations: 1,
      status: 'offline',
    })
    expect(remoteGateway.pushedOperations).toEqual([])

    networkState.setState('online')

    await waitFor(() => {
      expect(remoteGateway.pushedOperations).toHaveLength(1)
      expect(engine.getStatus()).toMatchObject({
        pendingOperations: 0,
        status: 'idle',
      })
    })

    expect((await repository.getNote(note.id))?.syncStatus).toBe('synced')
    expect(await repository.getLastServerRevision()).toBe(10)
    await engine.stop()
  })

  it('retries outbox pushes with injected backoff before marking success', async () => {
    const note = makeNote(noteId, 'Retry draft', 'Retry body')
    const repository = new MemoryNoteRepository([note], [makeOperation(note)])
    const remoteGateway = new FakeRemoteGateway()
    const networkState = new ManualNetworkStateMonitor('online')
    const sleeps: number[] = []
    remoteGateway.pushFailuresRemaining = 2
    const engine = new DefaultSyncEngine({
      networkState,
      noteRepository: repository,
      remoteGateway,
      retryPolicy: {
        baseDelayMs: 100,
        maxAttempts: 3,
      },
      sleep: async (durationMs) => {
        sleeps.push(durationMs)
      },
    })

    await engine.start()

    await waitFor(() => {
      expect(remoteGateway.pushedOperations).toHaveLength(3)
      expect(engine.getStatus().status).toBe('idle')
    })

    expect(sleeps).toEqual([100, 200])
    expect(repository.failedOps).toEqual([])
    await engine.stop()
  })

  it('pulls remote changes through Repository and advances the server revision', async () => {
    const remoteNote = makeNote(noteId, 'Remote draft', 'Remote body', 'synced')
    const remoteGateway = new FakeRemoteGateway([makeRemoteChange(remoteNote, 22)])
    const repository = new MemoryNoteRepository()
    const engine = new DefaultSyncEngine({
      clock: () => now,
      networkState: new ManualNetworkStateMonitor('online'),
      noteRepository: repository,
      remoteGateway,
      sleep: async () => undefined,
    })

    await engine.start()

    await waitFor(() => {
      expect(repository.appliedChanges).toHaveLength(1)
      expect(engine.getStatus().status).toBe('idle')
    })

    expect((await repository.getNote(noteId))?.syncStatus).toBe('synced')
    expect(await repository.getLastServerRevision()).toBe(22)
    await engine.stop()
  })

  it('preserves local dirty text as a conflict instead of applying remote overwrite', async () => {
    const localNote = makeNote(noteId, 'Local draft', 'Keep this local text')
    const remoteNote = {
      ...makeNote(noteId, 'Remote draft', 'Remote overwrite', 'synced'),
      deviceId: remoteDeviceId,
      lastOpId: operationIdSchema.parse('op_remote_conflict'),
    }
    const repository = new MemoryNoteRepository([localNote])
    const remoteGateway = new FakeRemoteGateway([
      makeRemoteChange(remoteNote, 31, remoteDeviceId),
    ])
    const engine = new DefaultSyncEngine({
      clock: () => now,
      networkState: new ManualNetworkStateMonitor('online'),
      noteRepository: repository,
      remoteGateway,
      sleep: async () => undefined,
    })

    await engine.start()

    await waitFor(() => {
      expect(repository.conflicts).toHaveLength(1)
      expect(engine.getStatus().status).toBe('conflict')
    })

    const preservedNote = await repository.getNote(noteId)
    expect(preservedNote?.syncStatus).toBe('conflict')
    expect(preservedNote && !preservedNote.isLocked ? preservedNote.preview : '').toBe(
      'Keep this local text',
    )
    expect(repository.conflictCopies).toHaveLength(1)
    expect(repository.conflictCopies[0]).toMatchObject({
      preview: 'Remote overwrite',
      syncStatus: 'synced',
      title: 'Remote draft (Conflict copy)',
    })
    expect(repository.appliedChanges).toEqual([])
    expect(await repository.getLastServerRevision()).toBe(31)
    await engine.stop()
  })

  it('applies realtime changes through the same remote-change path', async () => {
    const repository = new MemoryNoteRepository()
    const remoteGateway = new FakeRemoteGateway()
    const engine = new DefaultSyncEngine({
      clock: () => now,
      networkState: new ManualNetworkStateMonitor('online'),
      noteRepository: repository,
      remoteGateway,
      sleep: async () => undefined,
    })
    const remoteNote = makeNote(noteId, 'Realtime draft', 'Realtime body', 'synced')

    await engine.start()
    expect(remoteGateway.listenerCount()).toBe(1)

    remoteGateway.emit(makeRemoteChange(remoteNote, 44))

    await waitFor(() => {
      expect(repository.appliedChanges).toHaveLength(1)
      expect(engine.getStatus()).toMatchObject({
        status: 'idle',
      })
    })

    expect((await repository.getNote(noteId))?.syncStatus).toBe('synced')
    expect(await repository.getLastServerRevision()).toBe(44)
    await engine.stop()
    expect(remoteGateway.listenerCount()).toBe(0)
  })
})
