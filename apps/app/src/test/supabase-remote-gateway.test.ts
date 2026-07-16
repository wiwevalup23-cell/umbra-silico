import { describe, expect, it, vi } from 'vitest'
import { mapLocalNoteToSyncPayload } from '@/repository/mappers/local-note-mapper'
import {
  createDraftLocalNote,
  deviceIdSchema,
  documentV1Contract,
  noteIdSchema,
  operationIdSchema,
  userIdSchema,
  type LocalNote,
  type SyncOperation,
} from '@/shared/contracts'
import { DefaultSupabaseRemoteGateway } from '@/sync/supabase/supabase-remote-gateway'
import type {
  SupabaseErrorLike,
  SupabaseNotesClient,
  SupabaseNotesSelectQuery,
  SupabaseNotesTable,
  SupabaseQueryResult,
  SupabaseRealtimeChannel,
  SupabaseRealtimePostgresFilter,
  SupabaseRealtimePostgresPayload,
  SupabaseRemoteNoteRow,
  SupabaseRemoteNoteUpsert,
} from '@/sync/supabase/supabase-client'

const now = '2026-07-05T12:00:00.000Z'
const userId = userIdSchema.parse('11111111-1111-4111-8111-111111111111')
const deviceId = deviceIdSchema.parse('22222222-2222-4222-8222-222222222222')
const noteId = noteIdSchema.parse('33333333-3333-4333-8333-333333333333')
const operationId = operationIdSchema.parse('44444444-4444-4444-8444-444444444444')

type MockState = {
  channel: MockRealtimeChannel | null
  limitCount: number | null
  orderCall: { ascending?: boolean; column: string } | null
  pullRows: SupabaseRemoteNoteRow[]
  removeChannelCalls: number
  selectColumns: string[]
  upsertError: SupabaseErrorLike | null
  upsertOptions: { onConflict?: string } | null
  upsertRevision: number
  upsertedRow: SupabaseRemoteNoteUpsert | null
  whereGt: { column: string; value: number } | null
}

function createNote(): LocalNote {
  return {
    ...createDraftLocalNote({
      deviceId,
      document: {
        ...documentV1Contract.createEmpty(),
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Remote body' }],
            },
          ],
        },
      },
      id: noteId,
      now,
      title: 'Remote note',
      userId,
    }),
    localRevision: 7,
    preview: 'Remote body',
  }
}

function createOperation(note: LocalNote): SyncOperation {
  return {
    attemptCount: 0,
    baseRemoteRevision: null,
    createdAt: now,
    deviceId,
    lastError: null,
    noteId: note.id,
    opId: operationId,
    payload: mapLocalNoteToSyncPayload(note),
    status: 'pending',
    type: 'note.update',
    userId,
  }
}

function createRemoteRow(note: LocalNote, serverRevision: number): SupabaseRemoteNoteRow {
  return {
    client_updated_at: note.updatedAt,
    deleted_at: note.deletedAt,
    device_id: note.deviceId,
    document: note.isLocked ? null : note.document,
    encrypted_payload: note.encryptedPayload,
    encryption: note.encryption,
    id: note.id,
    is_locked: note.isLocked,
    last_op_id: operationId,
    payload: mapLocalNoteToSyncPayload(note),
    preview: note.preview,
    schema_version: note.schemaVersion,
    server_revision: serverRevision,
    server_updated_at: now,
    title: note.title,
    user_id: note.userId,
  }
}

class MockRealtimeChannel implements SupabaseRealtimeChannel {
  readonly filters: SupabaseRealtimePostgresFilter[] = []
  callback: ((payload: SupabaseRealtimePostgresPayload) => void) | null = null
  subscribed = false
  unsubscribed = false

  on(
    event: 'postgres_changes',
    filter: SupabaseRealtimePostgresFilter,
    callback: (payload: SupabaseRealtimePostgresPayload) => void,
  ) {
    expect(event).toBe('postgres_changes')
    this.filters.push(filter)
    this.callback = callback
    return this
  }

  subscribe() {
    this.subscribed = true
    return this
  }

  async unsubscribe() {
    this.unsubscribed = true
  }

  emit(row: SupabaseRemoteNoteRow) {
    this.callback?.({
      eventType: 'UPDATE',
      new: row,
      old: {},
    })
  }
}

class MockSelectQuery implements SupabaseNotesSelectQuery {
  private readonly state: MockState

  constructor(state: MockState) {
    this.state = state
  }

  gt(column: 'server_revision', value: number) {
    this.state.whereGt = { column, value }
    return this
  }

  order(column: 'server_revision', options?: { ascending?: boolean }) {
    this.state.orderCall = { column, ...options }
    return this
  }

  async limit(count: number): Promise<SupabaseQueryResult<SupabaseRemoteNoteRow[]>> {
    this.state.limitCount = count
    return {
      data: this.state.pullRows,
      error: null,
    }
  }
}

class MockNotesTable implements SupabaseNotesTable {
  private readonly state: MockState

  constructor(state: MockState) {
    this.state = state
  }

  select(columns = '*') {
    this.state.selectColumns.push(columns)
    return new MockSelectQuery(this.state)
  }

  upsert(values: SupabaseRemoteNoteUpsert, options?: { onConflict?: string }) {
    this.state.upsertedRow = values
    this.state.upsertOptions = options ?? null

    return {
      select: (columns = '*') => {
        this.state.selectColumns.push(columns)

        return {
          single: async (): Promise<SupabaseQueryResult<SupabaseRemoteNoteRow>> => {
            if (this.state.upsertError) {
              return {
                data: null,
                error: this.state.upsertError,
              }
            }

            return {
              data: {
                ...values,
                server_revision: this.state.upsertRevision,
                server_updated_at: now,
              },
              error: null,
            }
          },
        }
      },
    }
  }
}

class MockSupabaseNotesClient implements SupabaseNotesClient {
  readonly state: MockState

  constructor(rows: SupabaseRemoteNoteRow[] = []) {
    this.state = {
      channel: null,
      limitCount: null,
      orderCall: null,
      pullRows: rows,
      removeChannelCalls: 0,
      selectColumns: [],
      upsertError: null,
      upsertOptions: null,
      upsertRevision: 42,
      upsertedRow: null,
      whereGt: null,
    }
  }

  channel() {
    this.state.channel = new MockRealtimeChannel()
    return this.state.channel
  }

  from(table: 'notes') {
    expect(table).toBe('notes')
    return new MockNotesTable(this.state)
  }

  async removeChannel(channel: SupabaseRealtimeChannel) {
    expect(channel).toBe(this.state.channel)
    this.state.removeChannelCalls += 1
  }
}

describe('DefaultSupabaseRemoteGateway', () => {
  it('pushes local note snapshots with Supabase upsert and returns server revision', async () => {
    const note = createNote()
    const operation = createOperation(note)
    const client = new MockSupabaseNotesClient()
    const gateway = new DefaultSupabaseRemoteGateway({ client })

    await expect(gateway.pushOperation(operation)).resolves.toBe(42)

    expect(client.state.upsertOptions).toEqual({ onConflict: 'id' })
    expect(client.state.upsertedRow).toMatchObject({
      client_updated_at: note.updatedAt,
      device_id: deviceId,
      document: note.document,
      id: note.id,
      is_locked: false,
      last_op_id: operationId,
      preview: 'Remote body',
      title: 'Remote note',
      user_id: userId,
    })
    expect(client.state.upsertedRow?.payload).toEqual(operation.payload)
  })

  it('pushes locked note snapshots as opaque encrypted payloads without plaintext', async () => {
    const lockedNote: LocalNote = {
      ...createNote(),
      title: null,
      preview: null,
      isLocked: true,
      document: null,
      encryptedPayload: 'ciphertext.base64',
      encryption: {
        version: 1,
        algorithm: 'AES-GCM-256',
        payloadNonce: 'payload-nonce',
        wrappedDek: 'wrapped-dek',
        wrapNonce: 'wrap-nonce',
      },
    }
    const operation = createOperation(lockedNote)
    const client = new MockSupabaseNotesClient()
    const gateway = new DefaultSupabaseRemoteGateway({ client })

    await expect(gateway.pushOperation(operation)).resolves.toBe(42)

    expect(client.state.upsertedRow).toMatchObject({
      document: null,
      encrypted_payload: 'ciphertext.base64',
      is_locked: true,
      preview: null,
      title: null,
    })
    expect(JSON.stringify(client.state.upsertedRow)).not.toContain('Remote note')
    expect(JSON.stringify(client.state.upsertedRow)).not.toContain('Remote body')
  })

  it('pulls remote note changes after the last server revision', async () => {
    const note = createNote()
    const client = new MockSupabaseNotesClient([createRemoteRow(note, 51)])
    const gateway = new DefaultSupabaseRemoteGateway({ client })

    const changes = await gateway.pullSince(50, 25)

    expect(client.state.whereGt).toEqual({ column: 'server_revision', value: 50 })
    expect(client.state.orderCall).toEqual({
      ascending: true,
      column: 'server_revision',
    })
    expect(client.state.limitCount).toBe(25)
    expect(changes).toEqual([
      {
        changedByDeviceId: deviceId,
        noteId,
        payload: mapLocalNoteToSyncPayload(note),
        serverRevision: 51,
      },
    ])
  })

  it('subscribes to Supabase realtime note changes and cleans up the channel', async () => {
    const note = createNote()
    const client = new MockSupabaseNotesClient()
    const onChange = vi.fn()
    const gateway = new DefaultSupabaseRemoteGateway({ client })

    const unsubscribe = gateway.subscribeToChanges(onChange)

    expect(client.state.channel?.subscribed).toBe(true)
    expect(client.state.channel?.filters).toEqual([
      {
        event: '*',
        schema: 'public',
        table: 'notes',
      },
    ])

    client.state.channel?.emit(createRemoteRow(note, 77))

    expect(onChange).toHaveBeenCalledWith({
      changedByDeviceId: deviceId,
      noteId,
      payload: mapLocalNoteToSyncPayload(note),
      serverRevision: 77,
    })

    unsubscribe()
    await Promise.resolve()
    await Promise.resolve()

    expect(client.state.channel?.unsubscribed).toBe(true)
    expect(client.state.removeChannelCalls).toBe(1)
  })

  it('surfaces Supabase push errors', async () => {
    const note = createNote()
    const client = new MockSupabaseNotesClient()
    client.state.upsertError = {
      code: '42501',
      message: 'new row violates row-level security policy',
    }
    const gateway = new DefaultSupabaseRemoteGateway({ client })

    await expect(gateway.pushOperation(createOperation(note))).rejects.toThrow(
      'Supabase push failed (42501)',
    )
  })
})
