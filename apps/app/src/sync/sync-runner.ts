import type { SyncEngine } from '@/sync/sync-engine'

export async function startSyncEngine(engine: SyncEngine): Promise<void> {
  await engine.start()
}
