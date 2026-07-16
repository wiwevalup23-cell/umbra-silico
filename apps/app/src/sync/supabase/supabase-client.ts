import { createClient } from '@supabase/supabase-js'
import type { JsonValue } from '@/shared/contracts'
import {
  readSiliconSupabaseConfig,
  type SiliconSupabaseConfig,
  type SupabaseRuntimeEnv,
} from '@/sync/supabase/supabase-config'

export { readSiliconSupabaseConfig }
export type { SiliconSupabaseConfig, SupabaseRuntimeEnv }

export type SupabaseErrorLike = {
  code?: string
  details?: string
  hint?: string
  message: string
}

export type SupabaseQueryResult<TData> = {
  data: TData | null
  error: SupabaseErrorLike | null
}

export type SupabaseQueryPromise<TData> = PromiseLike<SupabaseQueryResult<TData>>

export type SupabaseRemoteNoteRow = {
  client_updated_at: string
  deleted_at: string | null
  device_id: string | null
  document: JsonValue | null
  encrypted_payload: string | null
  encryption: JsonValue | null
  id: string
  is_locked: boolean
  last_op_id: string | null
  payload: JsonValue
  preview: string | null
  schema_version: number
  server_revision: number | string
  server_updated_at: string
  title: string | null
  user_id: string
}

export type SupabaseRemoteNoteUpsert = Omit<
  SupabaseRemoteNoteRow,
  'server_revision' | 'server_updated_at'
>

export type SupabaseRealtimePostgresFilter = {
  event: '*' | 'INSERT' | 'UPDATE' | 'DELETE'
  filter?: string
  schema: 'public'
  table: 'notes'
}

export type SupabaseRealtimePostgresPayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: unknown
  old: unknown
}

export type SupabaseRealtimeChannel = {
  on(
    event: 'postgres_changes',
    filter: SupabaseRealtimePostgresFilter,
    callback: (payload: SupabaseRealtimePostgresPayload) => void,
  ): SupabaseRealtimeChannel
  subscribe(callback?: (status: string) => void): SupabaseRealtimeChannel
  unsubscribe(): Promise<unknown> | unknown
}

export type SupabaseNotesTable = {
  select(columns?: string): SupabaseNotesSelectQuery
  upsert(
    values: SupabaseRemoteNoteUpsert,
    options?: { onConflict?: string },
  ): SupabaseNotesMutationQuery
}

export type SupabaseNotesMutationQuery = {
  select(columns?: string): {
    single(): SupabaseQueryPromise<SupabaseRemoteNoteRow>
  }
}

export type SupabaseNotesSelectQuery = {
  gt(column: 'server_revision', value: number): SupabaseNotesSelectQuery
  limit(count: number): SupabaseQueryPromise<SupabaseRemoteNoteRow[]>
  order(
    column: 'server_revision',
    options?: { ascending?: boolean },
  ): SupabaseNotesSelectQuery
}

export type SupabaseNotesClient = {
  channel(name: string): SupabaseRealtimeChannel
  from(table: 'notes'): SupabaseNotesTable
  removeChannel?(channel: SupabaseRealtimeChannel): Promise<unknown> | unknown
}

export function createSiliconSupabaseClient(
  config: SiliconSupabaseConfig,
): SupabaseNotesClient {
  return createClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
    db: {
      schema: 'public',
    },
  }) as unknown as SupabaseNotesClient
}

export function createConfiguredSiliconSupabaseClient(
  env: SupabaseRuntimeEnv = import.meta.env,
): SupabaseNotesClient {
  const config = readSiliconSupabaseConfig(env)

  if (!config) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.',
    )
  }

  return createSiliconSupabaseClient(config)
}
