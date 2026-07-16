import { z } from 'zod'
import {
  deviceIdSchema,
  jsonValueSchema,
  localNoteSchema,
  noteIdSchema,
  operationIdSchema,
  parseJsonValue,
  remoteNoteChangeSchema,
  userIdSchema,
  type JsonValue,
  type LocalNote,
  type RemoteNoteChange,
  type SyncOperation,
} from '@/shared/contracts'
import type {
  SupabaseErrorLike,
  SupabaseNotesClient,
  SupabaseRealtimeChannel,
  SupabaseRemoteNoteRow,
  SupabaseRemoteNoteUpsert,
} from '@/sync/supabase/supabase-client'

const remoteNoteSelect = [
  'id',
  'user_id',
  'schema_version',
  'title',
  'preview',
  'is_locked',
  'document',
  'encrypted_payload',
  'encryption',
  'payload',
  'client_updated_at',
  'server_updated_at',
  'server_revision',
  'last_op_id',
  'device_id',
  'deleted_at',
].join(',')

const serverRevisionSchema = z.preprocess(
  (value) => (typeof value === 'string' ? Number(value) : value),
  z.number().int().positive(),
)

const remoteNoteRowSchema: z.ZodType<SupabaseRemoteNoteRow> = z.object({
  client_updated_at: z.string().min(1),
  deleted_at: z.string().nullable(),
  device_id: z.string().nullable(),
  document: jsonValueSchema.nullable(),
  encrypted_payload: z.string().nullable(),
  encryption: jsonValueSchema.nullable(),
  id: z.string().min(1),
  is_locked: z.boolean(),
  last_op_id: z.string().nullable(),
  payload: jsonValueSchema,
  preview: z.string().nullable(),
  schema_version: z.number().int().positive(),
  server_revision: z.union([z.number(), z.string()]),
  server_updated_at: z.string().min(1),
  title: z.string().nullable(),
  user_id: z.string().min(1),
})

export type SupabaseRemoteGatewayUnsubscribe = () => void

export interface SupabaseRemoteGateway {
  pullSince(serverRevision: number, limit?: number): Promise<RemoteNoteChange[]>
  pushOperation(operation: SyncOperation): Promise<number>
  subscribeToChanges(
    onChange: (change: RemoteNoteChange) => void,
  ): SupabaseRemoteGatewayUnsubscribe
}

export type SupabaseRemoteGatewayOptions = {
  client: SupabaseNotesClient
  realtimeChannelName?: string
}

function createSupabaseErrorMessage(action: string, error: SupabaseErrorLike): string {
  const code = error.code ? ` (${error.code})` : ''
  return `Supabase ${action} failed${code}: ${error.message}`
}

function parseServerRevision(value: unknown): number {
  return serverRevisionSchema.parse(value)
}

function parseRemoteNoteRow(value: unknown): SupabaseRemoteNoteRow {
  return remoteNoteRowSchema.parse(value)
}

function parseNoteSnapshotPayload(payload: JsonValue): LocalNote {
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    payload.kind !== 'note.snapshot'
  ) {
    throw new Error('Supabase note payload must be a note.snapshot payload.')
  }

  const notePayload = payload.note

  if (!notePayload || typeof notePayload !== 'object' || Array.isArray(notePayload)) {
    throw new Error('Supabase note.snapshot payload is missing note data.')
  }

  return localNoteSchema.parse(notePayload)
}

function createRemoteChangeFromRow(value: unknown): RemoteNoteChange {
  const row = parseRemoteNoteRow(value)
  const change = {
    changedByDeviceId: row.device_id ? deviceIdSchema.parse(row.device_id) : null,
    noteId: noteIdSchema.parse(row.id),
    payload: parseJsonValue(row.payload),
    serverRevision: parseServerRevision(row.server_revision),
  }

  return remoteNoteChangeSchema.parse(change)
}

function createRemoteNoteUpsert(operation: SyncOperation): SupabaseRemoteNoteUpsert {
  const note = parseNoteSnapshotPayload(parseJsonValue(operation.payload))

  if (note.id !== operation.noteId) {
    throw new Error('Sync operation noteId does not match its note snapshot payload.')
  }

  return {
    client_updated_at: note.updatedAt,
    deleted_at: note.deletedAt,
    device_id: deviceIdSchema.parse(operation.deviceId),
    document: note.isLocked ? null : parseJsonValue(note.document),
    encrypted_payload: note.encryptedPayload,
    encryption: note.encryption ? parseJsonValue(note.encryption) : null,
    id: noteIdSchema.parse(operation.noteId),
    is_locked: note.isLocked,
    last_op_id: operationIdSchema.parse(operation.opId),
    payload: parseJsonValue(operation.payload),
    preview: note.preview,
    schema_version: note.schemaVersion,
    title: note.title,
    user_id: userIdSchema.parse(operation.userId),
  }
}

export class DefaultSupabaseRemoteGateway implements SupabaseRemoteGateway {
  private readonly client: SupabaseNotesClient
  private readonly realtimeChannelName: string

  constructor(options: SupabaseRemoteGatewayOptions) {
    this.client = options.client
    this.realtimeChannelName = options.realtimeChannelName ?? 'notes:remote-changes'
  }

  async pushOperation(operation: SyncOperation): Promise<number> {
    const row = createRemoteNoteUpsert(operation)
    const result = await this.client
      .from('notes')
      .upsert(row, { onConflict: 'id' })
      .select(remoteNoteSelect)
      .single()

    if (result.error) {
      throw new Error(createSupabaseErrorMessage('push', result.error))
    }

    if (!result.data) {
      throw new Error('Supabase push failed: no note row was returned.')
    }

    return parseServerRevision(result.data.server_revision)
  }

  async pullSince(serverRevision: number, limit = 500): Promise<RemoteNoteChange[]> {
    const result = await this.client
      .from('notes')
      .select(remoteNoteSelect)
      .gt('server_revision', serverRevision)
      .order('server_revision', { ascending: true })
      .limit(limit)

    if (result.error) {
      throw new Error(createSupabaseErrorMessage('pull', result.error))
    }

    return (result.data ?? []).map(createRemoteChangeFromRow)
  }

  subscribeToChanges(
    onChange: (change: RemoteNoteChange) => void,
  ): SupabaseRemoteGatewayUnsubscribe {
    const channel = this.client
      .channel(this.realtimeChannelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notes',
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            return
          }

          onChange(createRemoteChangeFromRow(payload.new))
        },
      )
      .subscribe()

    return () => {
      void this.unsubscribeChannel(channel)
    }
  }

  private async unsubscribeChannel(channel: SupabaseRealtimeChannel): Promise<void> {
    await channel.unsubscribe()

    if (this.client.removeChannel) {
      await this.client.removeChannel(channel)
    }
  }
}

export function createSupabaseRemoteGateway(
  options: SupabaseRemoteGatewayOptions,
): SupabaseRemoteGateway {
  return new DefaultSupabaseRemoteGateway(options)
}
