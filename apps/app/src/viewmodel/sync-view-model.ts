import { useCallback, useEffect, useState } from 'react'
import type { SyncStatusSnapshot } from '@/shared/contracts/sync'
import { useAppUiStore } from '@/viewmodel/app-ui-store'
import { useNoteRepository } from '@/viewmodel/repository-hooks'
import { useSyncEngine } from '@/viewmodel/sync-engine-hooks'

export type SyncViewModelState = {
  /**
   * False while the app runs purely local (no sync engine configured).
   * Pending-operation counts are only meaningful when a remote will
   * eventually drain the outbox.
   */
  hasRemote: boolean
  pendingOperations: number
  refreshPendingOperations(): Promise<void>
  setSyncBadge(status: SyncStatusSnapshot['status']): void
  status: SyncStatusSnapshot['status']
}

export function useSyncViewModel(): SyncViewModelState {
  const repository = useNoteRepository()
  const syncEngine = useSyncEngine()
  const status = useAppUiStore((state) => state.syncBadge)
  const setSyncBadge = useAppUiStore((state) => state.setSyncBadge)
  const [pendingOperations, setPendingOperations] = useState(0)
  const refreshPendingOperations = useCallback(async () => {
    if (syncEngine) {
      syncEngine.requestSync('manual')
      const snapshot = syncEngine.getStatus()
      setPendingOperations(snapshot.pendingOperations)
      setSyncBadge(snapshot.status)
      return
    }

    setPendingOperations((await repository.getPendingOps(1000)).length)
  }, [repository, setSyncBadge, syncEngine])

  useEffect(() => {
    if (syncEngine) {
      const snapshot = syncEngine.getStatus()
      setPendingOperations(snapshot.pendingOperations)
      setSyncBadge(snapshot.status)

      return syncEngine.subscribe((nextSnapshot: SyncStatusSnapshot) => {
        setPendingOperations(nextSnapshot.pendingOperations)
        setSyncBadge(nextSnapshot.status)
      })
    }

    let active = true

    async function refreshLocalPendingOperations() {
      const pendingOps = await repository.getPendingOps(1000)

      if (active) {
        setPendingOperations(pendingOps.length)
      }
    }

    void refreshLocalPendingOperations()

    return () => {
      active = false
    }
  }, [repository, setSyncBadge, syncEngine])

  return {
    hasRemote: syncEngine !== null,
    pendingOperations,
    refreshPendingOperations,
    setSyncBadge,
    status,
  }
}
