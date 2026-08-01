/**
 * Persistence for the one background image the user supplies themselves.
 *
 * Settings live in `localStorage`, which tops out around 5 MB for the whole
 * origin — a single wallpaper would evict every other setting with it. The blob
 * goes to IndexedDB instead and settings keep only the `custom` sentinel.
 *
 * Raw IndexedDB rather than Dexie: this module is a leaf that owns one record,
 * so it stays a plain browser-API service with nothing else to keep in sync.
 */

import {
  customBackgroundMaxBytes,
  supportedBackgroundMimeTypes,
} from '@/shared/backgrounds'

const DATABASE_NAME = 'umbra-silico-appearance'
const DATABASE_VERSION = 1
const STORE_NAME = 'backgrounds'

/** Only one custom background exists at a time, so the record key is fixed. */
const RECORD_KEY = 'custom'

export type StoredCustomBackground = {
  blob: Blob
  mimeType: string
  byteSize: number
  name: string
  updatedAt: string
}

export class UnsupportedBackgroundError extends Error {
  constructor(mimeType: string) {
    super(`Unsupported background image type: ${mimeType || 'unknown'}.`)
    this.name = 'UnsupportedBackgroundError'
  }
}

export class BackgroundTooLargeError extends Error {
  readonly byteSize: number
  readonly maxBytes: number

  constructor(byteSize: number, maxBytes: number) {
    super(`Background image is too large: ${byteSize} bytes (limit ${maxBytes}).`)
    this.name = 'BackgroundTooLargeError'
    this.byteSize = byteSize
    this.maxBytes = maxBytes
  }
}

function isSupported(mimeType: string): boolean {
  return (supportedBackgroundMimeTypes as readonly string[]).includes(mimeType)
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this runtime.'))
      return
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open the appearance store.'))
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase()

  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode)
      const request = work(transaction.objectStore(STORE_NAME))

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('Appearance store request failed.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Appearance store transaction aborted.'))
    })
  } finally {
    database.close()
  }
}

/** Returns the stored background, or `null` when the user has not picked one. */
export async function readCustomBackground(): Promise<StoredCustomBackground | null> {
  try {
    return (await withStore<StoredCustomBackground | undefined>('readonly', (store) =>
      store.get(RECORD_KEY),
    )) ?? null
  } catch {
    // A blocked or unavailable database should leave the app on its built-in
    // backgrounds rather than fail the render.
    return null
  }
}

export async function writeCustomBackground(file: Blob, name = ''): Promise<StoredCustomBackground> {
  if (!isSupported(file.type)) {
    throw new UnsupportedBackgroundError(file.type)
  }

  if (file.size > customBackgroundMaxBytes) {
    throw new BackgroundTooLargeError(file.size, customBackgroundMaxBytes)
  }

  const record: StoredCustomBackground = {
    blob: file,
    byteSize: file.size,
    mimeType: file.type,
    name,
    updatedAt: new Date().toISOString(),
  }

  await withStore('readwrite', (store) => store.put(record, RECORD_KEY))

  return record
}

export async function clearCustomBackground(): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(RECORD_KEY))
  } catch {
    // Nothing to remove is the same outcome as a removed record.
  }
}
