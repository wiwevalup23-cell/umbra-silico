import type { LocalImagesStore, LocalNotesStore } from '@/local-store/contracts'
import { createDexieDatabase } from '@/local-store/dexie/dexie-db'
import { createDexieImagesStore } from '@/local-store/dexie/dexie-images-store'
import { createDexieNotesStore } from '@/local-store/dexie/dexie-notes-store'
import { createTauriFsBlobStore } from '@/local-store/fs/tauri-fs-blob-store'
import { createSqliteImagesStore } from '@/local-store/sqlite/sqlite-images-store'
import {
  createSqliteNotesStore,
  initializeSqliteNotesStore,
} from '@/local-store/sqlite/sqlite-notes-store'
import { loadTauriSqliteDatabase } from '@/local-store/sqlite/tauri-sqlite-driver'

export type LocalStoreRuntime = 'browser' | 'tauri'

export type LocalNotesStoreFactoryOptions = {
  runtime: LocalStoreRuntime
  databaseName?: string
}

export type LocalStores = {
  notesStore: LocalNotesStore
  imagesStore: LocalImagesStore
}

// Notes and images share one database connection (SQLite) or one Dexie
// instance (browser); this factory is the single place that wires that up.
export async function createLocalStores(
  options: LocalNotesStoreFactoryOptions,
): Promise<LocalStores> {
  if (options.runtime === 'tauri') {
    const db = await loadTauriSqliteDatabase(
      options.databaseName ? `sqlite:${options.databaseName}` : undefined,
    )
    await initializeSqliteNotesStore(db)

    return {
      notesStore: createSqliteNotesStore(db),
      imagesStore: createSqliteImagesStore(db, createTauriFsBlobStore()),
    }
  }

  const database = createDexieDatabase(options.databaseName)

  return {
    notesStore: createDexieNotesStore({ database }),
    imagesStore: createDexieImagesStore({ database }),
  }
}

export async function createLocalNotesStore(
  options: LocalNotesStoreFactoryOptions,
): Promise<LocalNotesStore> {
  const { notesStore } = await createLocalStores(options)
  return notesStore
}
