import { useEffect, useState, type PropsWithChildren } from 'react'
import { createRepositories } from '@/repository'
import type { ImageRepository, NoteRepository } from '@/repository/contracts'
import { detectPlatform } from '@/platform'
import { createSyncEngine, type SyncEngine } from '@/sync'
import { readSiliconSupabaseConfig } from '@/sync/supabase/supabase-config'
import { publicAsset } from '@/shared/public-asset'
import { RepositoryProvider, SyncEngineProvider } from '@/viewmodel'

function ProviderState({ error }: { error?: string }) {
  return (
    <main className="sn-provider-state" role={error ? 'alert' : 'status'}>
      <section className="sn-provider-state__window">
        <img
          alt=""
          aria-hidden="true"
          src={publicAsset('assets/umbra-silico-eclipse-compass-u.svg')}
        />
        <div>
          <span>Umbra Silico</span>
          <strong>{error ? 'Local notebook unavailable' : 'Opening local notebook'}</strong>
          <p>{error ?? 'Preparing your private workspace…'}</p>
        </div>
        {!error ? <span className="sn-provider-state__pulse" aria-hidden="true" /> : null}
      </section>
    </main>
  )
}

export function AppProviders({ children }: PropsWithChildren) {
  const [repository, setRepository] = useState<NoteRepository | null>(null)
  const [imageRepository, setImageRepository] = useState<ImageRepository | null>(null)
  const [syncEngine, setSyncEngine] = useState<SyncEngine | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function bootRepository() {
      try {
        const runtime = detectPlatform()
        const { noteRepository: nextRepository, imageRepository: nextImageRepository } =
          await createRepositories({
            runtime,
            userId: 'local_user',
            deviceId: `${runtime}_device`,
            databaseName:
              runtime === 'tauri' ? 'silicon-nostalgia.db' : 'silicon-nostalgia-local',
          })

        // Deferred expiry GC is optional; crash recovery and orphan cleanup
        // already completed inside createRepositories before UI publication.
        void nextImageRepository.purgeExpiredImages().catch(() => undefined)
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
          setImageRepository(nextImageRepository)
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
    return <ProviderState error={error} />
  }

  if (!repository) {
    return <ProviderState />
  }

  return (
    <RepositoryProvider imageRepository={imageRepository} repository={repository}>
      <SyncEngineProvider syncEngine={syncEngine}>{children}</SyncEngineProvider>
    </RepositoryProvider>
  )
}
