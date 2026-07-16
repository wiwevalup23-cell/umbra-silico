import type { RemoteNoteChange } from '@/shared/contracts'
import type {
  SupabaseRemoteGateway,
  SupabaseRemoteGatewayUnsubscribe,
} from '@/sync/supabase'

export type RealtimeListener = {
  subscribe(onChange: (change: RemoteNoteChange) => void): () => void
}

export type RealtimeListenerDependencies = {
  remoteGateway: SupabaseRemoteGateway
}

export function createRealtimeListener({
  remoteGateway,
}: RealtimeListenerDependencies): RealtimeListener {
  return {
    subscribe(onChange): SupabaseRemoteGatewayUnsubscribe {
      return remoteGateway.subscribeToChanges(onChange)
    },
  }
}
