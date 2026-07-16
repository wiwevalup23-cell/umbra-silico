export {
  createConfiguredSiliconSupabaseClient,
  createSiliconSupabaseClient,
} from './supabase-client'
export type {
  SupabaseNotesClient,
  SupabaseRemoteNoteRow,
  SupabaseRemoteNoteUpsert,
} from './supabase-client'
export { readSiliconSupabaseConfig } from './supabase-config'
export type {
  SiliconSupabaseConfig,
  SupabaseRuntimeEnv,
} from './supabase-config'
export {
  createSupabaseRemoteGateway,
  DefaultSupabaseRemoteGateway,
} from './supabase-remote-gateway'
export type {
  SupabaseRemoteGateway,
  SupabaseRemoteGatewayOptions,
  SupabaseRemoteGatewayUnsubscribe,
} from './supabase-remote-gateway'
