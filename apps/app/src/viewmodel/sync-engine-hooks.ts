import { useContext } from 'react'
import type { SyncEngine } from '@/sync'
import { SyncEngineContext } from '@/viewmodel/sync-engine-context'

export function useSyncEngine(): SyncEngine | null {
  return useContext(SyncEngineContext)
}
