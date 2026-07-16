import type { LocalNotesStore } from '@/local-store/contracts'
import { createDexieNotesStore } from '@/local-store/dexie/dexie-notes-store'
import { createTauriSqliteNotesStore } from '@/local-store/sqlite/sqlite-notes-store'

export type LocalStoreRuntime = 'browser' | 'tauri'

export type LocalNotesStoreFactoryOptions = {
  runtime: LocalStoreRuntime
  databaseName?: string
}

export async function createLocalNotesStore(
  options: LocalNotesStoreFactoryOptions,
): Promise<LocalNotesStore> {
  if (options.runtime === 'tauri') {
    return createTauriSqliteNotesStore(
      options.databaseName ? `sqlite:${options.databaseName}` : undefined,
    )
  }

  return createDexieNotesStore({ databaseName: options.databaseName })
}
