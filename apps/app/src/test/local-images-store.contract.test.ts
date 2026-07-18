import 'fake-indexeddb/auto'

import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import type {
  BinaryBlobStore,
  LocalImagesStore,
  StoredImageMetaRow,
} from '@/local-store/contracts'
import { createDexieDatabase } from '@/local-store/dexie/dexie-db'
import { DexieImagesStore } from '@/local-store/dexie/dexie-images-store'
import { createSqliteImagesStore } from '@/local-store/sqlite/sqlite-images-store'
import type { SqlBindValue, SqlDatabase, SqlQueryResult } from '@/local-store/sqlite/sqlite-driver'
import {
  deviceIdSchema,
  imageIdSchema,
  noteIdSchema,
  userIdSchema,
  type LocalImageMeta,
  type NoteId,
} from '@/shared/contracts'

type StoreHarness = {
  name: string
  create(): Promise<{
    store: LocalImagesStore
    cleanup(): Promise<void>
  }>
}

const now = '2026-07-18T00:00:00.000Z'
const later = '2026-07-18T00:01:00.000Z'
const deletedAt = '2026-07-18T00:02:00.000Z'

const userId = userIdSchema.parse('user_images_contract')
const deviceId = deviceIdSchema.parse('device_images_contract')
const noteId = noteIdSchema.parse('note_images_contract')

function makeImageMeta(id: string, createdAt = now, imageNoteId: NoteId = noteId): LocalImageMeta {
  return {
    id: imageIdSchema.parse(id),
    noteId: imageNoteId,
    userId,
    sourceFileName: 'photo.jpg',
    mimeType: 'image/jpeg',
    byteSize: 4096,
    width: 4032,
    height: 3024,
    renditions: {
      original: { mimeType: 'image/jpeg', byteSize: 4096, width: 4032, height: 3024 },
      display: { mimeType: 'image/webp', byteSize: 1024, width: 2048, height: 1536 },
      thumb: { mimeType: 'image/webp', byteSize: 128, width: 320, height: 240 },
    },
    isEncrypted: false,
    encryption: null,
    createdAt,
    deletedAt: null,
    localRevision: 0,
    syncStatus: 'dirty',
    deviceId,
  }
}

function makeBlobBytes(seed: number): Uint8Array {
  const bytes = new Uint8Array(64)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = (seed + index) % 256
  }
  return bytes
}

class MemoryBinaryBlobStore implements BinaryBlobStore {
  readonly files = new Map<string, Uint8Array>()

  async read(key: string) {
    return this.files.get(key) ?? null
  }

  async write(key: string, bytes: Uint8Array) {
    this.files.set(key, bytes.slice())
  }

  async remove(key: string) {
    this.files.delete(key)
  }

  async move(sourceKey: string, destinationKey: string) {
    const bytes = this.files.get(sourceKey)

    if (bytes) {
      this.files.set(destinationKey, bytes)
      this.files.delete(sourceKey)
    }
  }
}

class MemoryImagesSqlDatabase implements SqlDatabase {
  private images = new Map<string, StoredImageMetaRow>()

  async execute(query: string, bindValues: SqlBindValue[] = []): Promise<SqlQueryResult> {
    const normalized = query.trim().toLowerCase()

    if (normalized.startsWith('insert into images')) {
      const row: StoredImageMetaRow = {
        id: String(bindValues[0]),
        noteId: String(bindValues[1]),
        userId: String(bindValues[2]),
        sourceFileName: bindValues[3] === null ? null : String(bindValues[3]),
        mimeType: String(bindValues[4]),
        byteSize: Number(bindValues[5]),
        width: Number(bindValues[6]),
        height: Number(bindValues[7]),
        renditions: String(bindValues[8]),
        isEncrypted: Number(bindValues[9]) === 1 ? 1 : 0,
        encryption: bindValues[10] === null ? null : String(bindValues[10]),
        createdAt: String(bindValues[11]),
        deletedAt: bindValues[12] === null ? null : String(bindValues[12]),
        localRevision: Number(bindValues[13]),
        syncStatus: String(bindValues[14]),
        deviceId: String(bindValues[15]),
      }

      this.images.set(row.id, row)
      return { rowsAffected: 1 }
    }

    if (normalized.startsWith('update images') && normalized.includes('deleted_at = null')) {
      const id = String(bindValues[1])
      const row = this.images.get(id)

      if (!row) {
        return { rowsAffected: 0 }
      }

      this.images.set(id, {
        ...row,
        deletedAt: null,
        syncStatus: String(bindValues[0]),
      })
      return { rowsAffected: 1 }
    }

    if (normalized.startsWith('update images')) {
      const id = String(bindValues[2])
      const row = this.images.get(id)

      if (!row) {
        return { rowsAffected: 0 }
      }

      this.images.set(id, {
        ...row,
        deletedAt: String(bindValues[0]),
        syncStatus: String(bindValues[1]),
      })
      return { rowsAffected: 1 }
    }

    if (normalized.startsWith('delete from images')) {
      const rowsAffected = this.images.delete(String(bindValues[0])) ? 1 : 0
      return { rowsAffected }
    }

    throw new Error(`Unsupported SQL execute: ${query}`)
  }

  async select<TRow extends Record<string, unknown>>(
    query: string,
    bindValues: SqlBindValue[] = [],
  ): Promise<TRow[]> {
    const normalized = query.trim().toLowerCase()

    const clone = (row: StoredImageMetaRow) => JSON.parse(JSON.stringify(row)) as TRow

    if (
      normalized.includes('from images') &&
      normalized.includes('where note_id = $1 and deleted_at is null')
    ) {
      return [...this.images.values()]
        .filter((row) => row.noteId === bindValues[0] && row.deletedAt === null)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map(clone)
    }

    if (normalized.includes('from images') && normalized.includes('where note_id = $1')) {
      return [...this.images.values()]
        .filter((row) => row.noteId === bindValues[0])
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map(clone)
    }

    if (normalized.includes('from images') && normalized.includes('where id = $1')) {
      const row = this.images.get(String(bindValues[0]))
      return row ? [clone(row)] : []
    }

    if (
      normalized.includes('from images') &&
      normalized.includes('where deleted_at is not null and deleted_at < $1')
    ) {
      return [...this.images.values()]
        .filter((row) => row.deletedAt !== null && row.deletedAt < String(bindValues[0]))
        .sort((left, right) => (left.deletedAt ?? '').localeCompare(right.deletedAt ?? ''))
        .map(clone)
    }

    if (normalized.includes('from images') && !normalized.includes('where')) {
      return [...this.images.values()]
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map(clone)
    }

    throw new Error(`Unsupported SQL select: ${query}`)
  }
}

const harnesses: StoreHarness[] = [
  {
    name: 'DexieImagesStore',
    async create() {
      const databaseName = `silicon_nostalgia_images_contract_${crypto.randomUUID()}`
      const database = createDexieDatabase(databaseName)
      const store = new DexieImagesStore({ database })

      return {
        store,
        async cleanup() {
          database.close()
          await Dexie.delete(databaseName)
        },
      }
    },
  },
  {
    name: 'SqliteImagesStore',
    async create() {
      const store = createSqliteImagesStore(
        new MemoryImagesSqlDatabase(),
        new MemoryBinaryBlobStore(),
      )

      return {
        store,
        async cleanup() {
          await Promise.resolve()
        },
      }
    },
  },
]

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

describe.each(harnesses)('$name contract', (harness) => {
  it('round-trips image metadata through zod validation', async () => {
    const { store, cleanup } = await harness.create()

    try {
      const meta = makeImageMeta('image_meta_roundtrip')

      await store.putImageMeta(meta)

      expect(await store.getImageMeta(meta.id)).toEqual(meta)
      expect(await store.getImageMeta(imageIdSchema.parse('image_missing'))).toBeNull()
    } finally {
      await cleanup()
    }
  })

  it('round-trips binary blobs per tier byte-for-byte', async () => {
    const { store, cleanup } = await harness.create()

    try {
      const meta = makeImageMeta('image_blob_roundtrip')
      await store.putImageMeta(meta)

      const originalBytes = makeBlobBytes(1)
      const thumbBytes = makeBlobBytes(101)

      await store.putImageBlob(
        meta.id,
        'original',
        new Blob([originalBytes as BlobPart], { type: 'image/jpeg' }),
      )
      await store.putImageBlob(
        meta.id,
        'thumb',
        new Blob([thumbBytes as BlobPart], { type: 'image/webp' }),
      )

      const original = await store.getImageBlob(meta.id, 'original')
      const thumb = await store.getImageBlob(meta.id, 'thumb')

      expect(original).not.toBeNull()
      expect(await blobBytes(original as Blob)).toEqual(originalBytes)
      expect(await blobBytes(thumb as Blob)).toEqual(thumbBytes)
      expect(await store.getImageBlob(meta.id, 'display')).toBeNull()

      await store.deleteImageBlob(meta.id, 'thumb')
      expect(await store.getImageBlob(meta.id, 'thumb')).toBeNull()
    } finally {
      await cleanup()
    }
  })

  it('promotes a staged blob over its active tier', async () => {
    const { store, cleanup } = await harness.create()

    try {
      const meta = makeImageMeta('image_blob_promote')
      const plaintext = makeBlobBytes(1)
      const ciphertext = makeBlobBytes(101)
      await store.putImageMeta(meta)
      await store.putImageBlob(
        meta.id,
        'original',
        new Blob([plaintext as BlobPart], { type: 'image/jpeg' }),
      )
      await store.putImageBlob(
        meta.id,
        'original.staged',
        new Blob([ciphertext as BlobPart], { type: 'application/octet-stream' }),
      )

      await store.promoteStagedImageBlob(meta.id, 'original')

      expect(
        await blobBytes((await store.getImageBlob(meta.id, 'original')) as Blob),
      ).toEqual(ciphertext)
      expect(await store.getImageBlob(meta.id, 'original.staged')).toBeNull()
    } finally {
      await cleanup()
    }
  })

  it('lists only live note images sorted by creation time', async () => {
    const { store, cleanup } = await harness.create()

    try {
      const first = makeImageMeta('image_list_first', now)
      const second = makeImageMeta('image_list_second', later)
      const foreign = makeImageMeta(
        'image_list_foreign',
        now,
        noteIdSchema.parse('note_other'),
      )

      await store.putImageMeta(second)
      await store.putImageMeta(first)
      await store.putImageMeta(foreign)
      await store.markImageDeleted(second.id, deletedAt)

      expect((await store.listNoteImages(noteId)).map((meta) => meta.id)).toEqual([
        first.id,
      ])
      expect((await store.listAllImagesForNote(noteId)).map((meta) => meta.id)).toEqual([
        first.id,
        second.id,
      ])
      expect((await store.listAllImages()).map((meta) => meta.id)).toEqual(
        expect.arrayContaining([first.id, second.id, foreign.id]),
      )
    } finally {
      await cleanup()
    }
  })

  it('tombstones, restores and hard-deletes images with their blobs', async () => {
    const { store, cleanup } = await harness.create()

    try {
      const meta = makeImageMeta('image_lifecycle')
      await store.putImageMeta(meta)
      await store.putImageBlob(
        meta.id,
        'original',
        new Blob([makeBlobBytes(7) as BlobPart], { type: 'image/jpeg' }),
      )

      await store.markImageDeleted(meta.id, deletedAt)
      expect((await store.getImageMeta(meta.id))?.deletedAt).toBe(deletedAt)
      expect((await store.getImageMeta(meta.id))?.syncStatus).toBe('dirty')

      await store.restoreImage(meta.id)
      expect((await store.getImageMeta(meta.id))?.deletedAt).toBeNull()

      await store.hardDeleteImage(meta.id)
      expect(await store.getImageMeta(meta.id)).toBeNull()
      expect(await store.getImageBlob(meta.id, 'original')).toBeNull()
    } finally {
      await cleanup()
    }
  })

  it('lists tombstoned images older than a cutoff', async () => {
    const { store, cleanup } = await harness.create()

    try {
      const old = makeImageMeta('image_gc_old')
      const fresh = makeImageMeta('image_gc_fresh')

      await store.putImageMeta(old)
      await store.putImageMeta(fresh)
      await store.markImageDeleted(old.id, now)
      await store.markImageDeleted(fresh.id, deletedAt)

      const expired = await store.listDeletedImagesBefore(later)

      expect(expired.map((meta) => meta.id)).toEqual([old.id])
    } finally {
      await cleanup()
    }
  })

  it('preserves encryption metadata on image meta rows', async () => {
    const { store, cleanup } = await harness.create()

    try {
      const encryptedMeta: LocalImageMeta = {
        ...makeImageMeta('image_encrypted'),
        isEncrypted: true,
        encryption: {
          original: {
            version: 1,
            algorithm: 'AES-GCM-256',
            payloadNonce: 'payload-nonce',
            wrappedDek: 'wrapped-dek',
            wrapNonce: 'wrap-nonce',
          },
        },
      }

      await store.putImageMeta(encryptedMeta)

      expect(await store.getImageMeta(encryptedMeta.id)).toEqual(encryptedMeta)
    } finally {
      await cleanup()
    }
  })
})
