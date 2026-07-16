import { useEffect, useState, type PropsWithChildren } from 'react'
import { createNoteRepository } from '@/repository'
import type { NoteRepository } from '@/repository/contracts'
import { detectPlatform } from '@/platform'
import { createSyncEngine, type SyncEngine } from '@/sync'
import { readSiliconSupabaseConfig } from '@/sync/supabase/supabase-config'
import { RepositoryProvider, SyncEngineProvider } from '@/viewmodel'

export function AppProviders({ children }: PropsWithChildren) {
  const [repository, setRepository] = useState<NoteRepository | null>(null)
  const [syncEngine, setSyncEngine] = useState<SyncEngine | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function bootRepository() {
      try {
        const runtime = detectPlatform()
        const nextRepository = await createNoteRepository({
          runtime,
          userId: 'local_user',
          deviceId: `${runtime}_device`,
          databaseName:
            runtime === 'tauri' ? 'silicon-nostalgia.db' : 'silicon-nostalgia-local',
        })
        const supabaseConfig = readSiliconSupabaseConfig()
        let nextSyncEngine: SyncEngine | null = null

        if (supabaseConfig) {
          try {
            const {
              createSiliconSupabaseClient,
              createSupabaseRemoteGateway,
            } = await import('@/sync/supabase')

            nextSyncEngine = createSyncEngine({
              noteRepository: nextRepository,
              remoteGateway: createSupabaseRemoteGateway({
                client: createSiliconSupabaseClient(supabaseConfig),
              }),
            })
          } catch (remoteSetupError) {
            void remoteSetupError
          }
        }

        if (!cancelled) {
          setRepository(nextRepository)
          setSyncEngine(nextSyncEngine)
        }
      } catch (bootError) {
        if (!cancelled) {
          setError(bootError instanceof Error ? bootError.message : 'Repository boot failed.')
        }
      }
    }

    void bootRepository()

    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return <div className="sn-provider-state">Repository error: {error}</div>
  }

  if (!repository) {
    return <div className="sn-provider-state">Loading local store...</div>
  }

  return (
    <RepositoryProvider repository={repository}>
      <SyncEngineProvider syncEngine={syncEngine}>{children}</SyncEngineProvider>
    </RepositoryProvider>
  )
}
