import { useEffect, type PropsWithChildren } from 'react'
import type { SyncEngine } from '@/sync'
import { SyncEngineContext } from '@/viewmodel/sync-engine-context'

export type SyncEngineProviderProps = PropsWithChildren<{
  syncEngine: SyncEngine | null
}>

export function SyncEngineProvider({
  children,
  syncEngine,
}: SyncEngineProviderProps) {
  useEffect(() => {
    if (!syncEngine) {
      return undefined
    }

    void syncEngine.start()

    return () => {
      void syncEngine.stop()
    }
  }, [syncEngine])

  return (
    <SyncEngineContext.Provider value={syncEngine}>
      {children}
    </SyncEngineContext.Provider>
  )
}
