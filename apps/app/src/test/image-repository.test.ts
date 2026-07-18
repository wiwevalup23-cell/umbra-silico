import { describe, expect, it } from 'vitest'
import { createCryptoService, createKeyring } from '@/crypto'
import type { ImageProcessor, ProcessedImage } from '@/images'
import type { ImageBlobKey, LocalImagesStore } from '@/local-store/contracts'
import { DefaultImageRepository } from '@/repository/image-repository'
import {
  createDraftLocalNote,
  deviceIdSchema,
  imageIdSchema,
  localImageMetaSchema,
  noteIdSchema,
  userIdSchema,
  type ImageId,
  type LocalCryptoProfile,
  type LocalImageMeta,
  type LocalNote,
  type NoteListItem,
  type NoteId,
} from '@/shared/contracts'

const userId = userIdSchema.parse('local_user')
const deviceId = deviceIdSchema.parse('browser_device')
const noteId = noteIdSchema.parse('note_images_repo')
const otherNoteId = noteIdSchema.parse('note_images_repo_other')
const baseNow = '2026-07-18T12:00:00.000Z'

class MemoryImagesStore implements LocalImagesStore {
  readonly metas = new Map<string, LocalImageMeta>()
  readonly blobs = new Map<string, Blob>()

  private blobKey(id: ImageId, key: ImageBlobKey): string {
    return `${id}/${key}`
  }

  async listAllImages() {
    return [...this.metas.values()]
  }

  async listNoteImages(target: NoteId) {
    return [...this.metas.values()]
      .filter((meta) => meta.noteId === target && meta.deletedAt === null)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  }

  async listAllImagesForNote(target: NoteId) {
    return [...this.metas.values()]
      .filter((meta) => meta.noteId === target)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  }

  async getImageMeta(id: ImageId) {
    return this.metas.get(id) ?? null
  }

  async putImageMeta(meta: LocalImageMeta) {
    this.metas.set(meta.id, localImageMetaSchema.parse(meta))
  }

  async getImageBlob(id: ImageId, key: ImageBlobKey) {
    return this.blobs.get(this.blobKey(id, key)) ?? null
  }

  async putImageBlob(id: ImageId, key: ImageBlobKey, blob: Blob) {
    this.blobs.set(this.blobKey(id, key), blob)
  }

  async deleteImageBlob(id: ImageId, key: ImageBlobKey) {
    this.blobs.delete(this.blobKey(id, key))
  }

  async promoteStagedImageBlob(id: ImageId, tier: 'original' | 'display' | 'thumb') {
    const stagedKey = this.blobKey(id, `${tier}.staged`)
    const staged = this.blobs.get(stagedKey)

    if (staged) {
      this.blobs.set(this.blobKey(id, tier), staged)
      this.blobs.delete(stagedKey)
    }
  }

  async markImageDeleted(id: ImageId, deletedAt: string) {
    const meta = this.metas.get(id)
    if (meta) {
      this.metas.set(id, { ...meta, deletedAt, syncStatus: 'dirty' })
    }
  }

  async restoreImage(id: ImageId) {
    const meta = this.metas.get(id)
    if (meta) {
      this.metas.set(id, { ...meta, deletedAt: null, syncStatus: 'dirty' })
    }
  }

  async hardDeleteImage(id: ImageId) {
    this.metas.delete(id)
    for (const key of [...this.blobs.keys()]) {
      if (key.startsWith(`${id}/`)) {
        this.blobs.delete(key)
      }
    }
  }

  async listDeletedImagesBefore(cutoffIso: string) {
    return [...this.metas.values()].filter(
      (meta) => meta.deletedAt !== null && meta.deletedAt < cutoffIso,
    )
  }
}

function bytesOf(seed: number, length = 32): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length)
  for (let index = 0; index < length; index += 1) {
    bytes[index] = (seed + index) % 256
  }
  return bytes
}

function fakeProcessed(options: { withDisplay?: boolean } = {}): ProcessedImage {
  const withDisplay = options.withDisplay ?? true

  return {
    original: {
      blob: new Blob([bytesOf(1)], { type: 'image/jpeg' }),
      info: { mimeType: 'image/jpeg', byteSize: 32, width: 4000, height: 3000 },
    },
    display: withDisplay
      ? {
          blob: new Blob([bytesOf(2)], { type: 'image/webp' }),
          info: { mimeType: 'image/webp', byteSize: 32, width: 2048, height: 1536 },
        }
      : null,
    thumb: {
      blob: new Blob([bytesOf(3)], { type: 'image/webp' }),
      info: { mimeType: 'image/webp', byteSize: 32, width: 320, height: 240 },
    },
    width: 4000,
    height: 3000,
  }
}

function fakeProcessor(options: { withDisplay?: boolean } = {}): ImageProcessor {
  return {
    async process() {
      return fakeProcessed(options)
    },
  }
}

type Harness = {
  store: MemoryImagesStore
  repository: DefaultImageRepository
  clockNow: { value: string }
  profile: LocalCryptoProfile
  notes: Map<NoteId, LocalNote>
}

async function createHarness(
  options: { withDisplay?: boolean } = {},
): Promise<Harness> {
  const store = new MemoryImagesStore()
  const cryptoService = createCryptoService()
  const keyring = createKeyring(cryptoService)
  const clockNow = { value: baseNow }

  // Creating the profile through the keyring caches the master key, matching
  // the app flow where lockNote runs before lockNoteImages.
  const resolved = await keyring.resolveMasterKeyForLock({
    credentials: { masterPassword: 'correct horse battery' },
    now: baseNow,
    profile: null,
    userId,
  })
  let profile: LocalCryptoProfile | null = resolved.profile
  const notes = new Map<NoteId, LocalNote>([
    [
      noteId,
      createDraftLocalNote({
        deviceId,
        id: noteId,
        now: baseNow,
        title: 'Images note',
        userId,
      }),
    ],
    [
      otherNoteId,
      createDraftLocalNote({
        deviceId,
        id: otherNoteId,
        now: baseNow,
        title: 'Other images note',
        userId,
      }),
    ],
  ])

  let idCounter = 0
  const repository = new DefaultImageRepository({
    localImagesStore: store,
    imageProcessor: fakeProcessor(options),
    localNotesStore: {
      getCryptoProfile: async () => profile,
      setCryptoProfile: async (nextProfile) => {
        profile = nextProfile
      },
      getNote: async (targetNoteId) => notes.get(targetNoteId) ?? null,
      listNotes: async () =>
        [...notes.values()]
          .filter((note) => note.deletedAt === null)
          .map(
            (note): NoteListItem => ({
              id: note.id,
              title: note.isLocked ? 'Locked note' : note.title,
              preview: note.isLocked ? '' : note.preview,
              isLocked: note.isLocked,
              parentFolderId: note.parentFolderId,
              updatedAt: note.updatedAt,
              syncStatus: note.syncStatus,
            }),
          ),
      listDeletedNotes: async () =>
        [...notes.values()]
          .filter((note) => note.deletedAt !== null)
          .map(
            (note): NoteListItem => ({
              id: note.id,
              title: note.isLocked ? 'Locked note' : note.title,
              preview: note.isLocked ? '' : note.preview,
              isLocked: note.isLocked,
              parentFolderId: note.parentFolderId,
              updatedAt: note.updatedAt,
              syncStatus: note.syncStatus,
            }),
          ),
    },
    cryptoService,
    keyring,
    userId,
    deviceId,
    clock: () => clockNow.value,
    idFactory: () => `image_${++idCounter}`,
  })

  return { store, repository, clockNow, notes, profile: resolved.profile }
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

describe('DefaultImageRepository', () => {
  it('imports an image: blobs for every tier, validated meta, live query refresh', async () => {
    const { store, repository } = await createHarness()
    const liveQuery = repository.liveNoteImages(noteId)

    const imported = await repository.importImage({
      noteId,
      file: new Blob([bytesOf(9)], { type: 'image/jpeg' }),
      fileName: 'holiday.jpg',
    })

    expect(imported.width).toBe(4000)
    expect(imported.height).toBe(3000)

    const meta = await store.getImageMeta(imported.imageId)
    expect(meta).toMatchObject({
      noteId,
      sourceFileName: 'holiday.jpg',
      isEncrypted: false,
      syncStatus: 'dirty',
    })
    expect(Object.keys(meta?.renditions ?? {}).sort()).toEqual([
      'display',
      'original',
      'thumb',
    ])
    expect(await store.getImageBlob(imported.imageId, 'original')).not.toBeNull()
    expect(await store.getImageBlob(imported.imageId, 'display')).not.toBeNull()
    expect(await store.getImageBlob(imported.imageId, 'thumb')).not.toBeNull()

    expect(liveQuery.getSnapshot()).toHaveLength(1)
    expect(liveQuery.getSnapshot()[0]?.id).toBe(imported.imageId)
  })

  it('falls back across tiers when a rendition is missing', async () => {
    const { repository } = await createHarness({ withDisplay: false })
    const imported = await repository.importImage({
      noteId,
      file: new Blob([bytesOf(9)], { type: 'image/jpeg' }),
    })

    const display = await repository.getImageBlob(imported.imageId, 'display')

    // No display rendition stored: the original serves in its place.
    expect(display).not.toBeNull()
    expect(await blobBytes(display as Blob)).toEqual(bytesOf(1))
  })

  it('reconciles: tombstones unreferenced images and restores referenced ones', async () => {
    const { store, repository } = await createHarness()
    const kept = await repository.importImage({ noteId, file: new Blob([bytesOf(1)], { type: 'image/jpeg' }) })
    const removed = await repository.importImage({ noteId, file: new Blob([bytesOf(2)], { type: 'image/jpeg' }) })
    const foreign = await repository.importImage({ noteId: otherNoteId, file: new Blob([bytesOf(3)], { type: 'image/jpeg' }) })

    await repository.reconcileNoteImages(noteId, [kept.imageId])

    expect((await store.getImageMeta(kept.imageId))?.deletedAt).toBeNull()
    expect((await store.getImageMeta(removed.imageId))?.deletedAt).not.toBeNull()
    // Foreign notes are never touched by another note's reconcile.
    expect((await store.getImageMeta(foreign.imageId))?.deletedAt).toBeNull()

    // Undo: the reference came back before the purge — restore the tombstone.
    await repository.reconcileNoteImages(noteId, [kept.imageId, removed.imageId])
    expect((await store.getImageMeta(removed.imageId))?.deletedAt).toBeNull()
  })

  it('purges only tombstones older than the grace period', async () => {
    const { store, repository, clockNow } = await createHarness()
    const imported = await repository.importImage({ noteId, file: new Blob([bytesOf(1)], { type: 'image/jpeg' }) })

    await repository.reconcileNoteImages(noteId, [])
    expect(await repository.purgeExpiredImages()).toBe(0)
    expect(await store.getImageMeta(imported.imageId)).not.toBeNull()

    clockNow.value = '2026-07-26T12:00:01.000Z'
    expect(await repository.purgeExpiredImages()).toBe(1)
    expect(await store.getImageMeta(imported.imageId)).toBeNull()
    expect(await store.getImageBlob(imported.imageId, 'original')).toBeNull()
  })

  it('locks note images: every stored tier becomes ciphertext and decrypts on read', async () => {
    const { store, repository } = await createHarness()
    const imported = await repository.importImage({ noteId, file: new Blob([bytesOf(9)], { type: 'image/jpeg' }) })

    await repository.lockNoteImages(noteId)

    const meta = await store.getImageMeta(imported.imageId)
    expect(meta?.isEncrypted).toBe(true)
    expect(Object.keys(meta?.encryption ?? {}).sort()).toEqual([
      'display',
      'original',
      'thumb',
    ])

    const storedOriginal = await store.getImageBlob(imported.imageId, 'original')
    expect(await blobBytes(storedOriginal as Blob)).not.toEqual(bytesOf(1))
    // Staged blobs are promoted and cleaned up.
    expect(await store.getImageBlob(imported.imageId, 'original.staged')).toBeNull()

    const decrypted = await repository.getImageBlob(imported.imageId, 'original')
    expect(await blobBytes(decrypted as Blob)).toEqual(bytesOf(1))
    expect((decrypted as Blob).type).toBe('image/jpeg')
  })

  it('prepares ciphertext before lock publication and can roll it back safely', async () => {
    const { store, repository } = await createHarness()
    const imported = await repository.importImage({
      noteId,
      file: new Blob([bytesOf(9)], { type: 'image/jpeg' }),
    })
    const plaintext = await blobBytes(
      (await store.getImageBlob(imported.imageId, 'original')) as Blob,
    )

    await repository.prepareNoteImagesLock(noteId, {
      masterPassword: 'correct horse battery',
    })

    const preparedMeta = await store.getImageMeta(imported.imageId)
    expect(preparedMeta?.isEncrypted).toBe(false)
    expect(preparedMeta?.encryption?.original).toBeDefined()
    expect(await store.getImageBlob(imported.imageId, 'original.staged')).not.toBeNull()
    expect(
      await blobBytes((await store.getImageBlob(imported.imageId, 'original')) as Blob),
    ).toEqual(plaintext)

    await repository.rollbackPreparedNoteImagesLock(noteId)

    expect((await store.getImageMeta(imported.imageId))?.encryption).toBeNull()
    expect(await store.getImageBlob(imported.imageId, 'original.staged')).toBeNull()
    expect(
      await blobBytes((await store.getImageBlob(imported.imageId, 'original')) as Blob),
    ).toEqual(plaintext)
  })

  it('recovers a prepared lock after the note lock was published', async () => {
    const { store, repository, notes } = await createHarness()
    const imported = await repository.importImage({
      noteId,
      file: new Blob([bytesOf(9)], { type: 'image/jpeg' }),
    })

    await repository.prepareNoteImagesLock(noteId, {
      masterPassword: 'correct horse battery',
    })
    const note = notes.get(noteId) as LocalNote
    notes.set(noteId, { ...note, isLocked: true } as unknown as LocalNote)

    await repository.recoverPendingImageOperations()

    expect((await store.getImageMeta(imported.imageId))?.isEncrypted).toBe(true)
    expect(await store.getImageBlob(imported.imageId, 'original.staged')).toBeNull()
    const decrypted = await repository.getImageBlob(imported.imageId, 'original')
    expect(await blobBytes(decrypted as Blob)).toEqual(bytesOf(1))
  })

  it('encrypts imports immediately when the persisted note is locked', async () => {
    const { store, repository, notes } = await createHarness()
    const note = notes.get(noteId) as LocalNote
    notes.set(noteId, { ...note, isLocked: true } as unknown as LocalNote)

    const imported = await repository.importImage({
      noteId,
      file: new Blob([bytesOf(9)], { type: 'image/jpeg' }),
    })

    const meta = await store.getImageMeta(imported.imageId)
    const stored = await store.getImageBlob(imported.imageId, 'original')
    expect(meta?.isEncrypted).toBe(true)
    expect(meta?.encryption?.original).toBeDefined()
    expect(await blobBytes(stored as Blob)).not.toEqual(bytesOf(1))
    const decrypted = await repository.getImageBlob(imported.imageId, 'original')
    expect(await blobBytes(decrypted as Blob)).toEqual(bytesOf(1))
  })

  it('retains a discoverable tombstone when import and immediate cleanup fail', async () => {
    const { store, repository } = await createHarness()
    const putImageMeta = store.putImageMeta.bind(store)
    let metadataWrites = 0
    store.putImageMeta = async (meta) => {
      metadataWrites += 1
      if (metadataWrites === 2) {
        throw new Error('metadata activation failed')
      }
      await putImageMeta(meta)
    }
    store.hardDeleteImage = async () => {
      throw new Error('cleanup failed')
    }

    await expect(
      repository.importImage({
        noteId,
        file: new Blob([bytesOf(9)], { type: 'image/jpeg' }),
      }),
    ).rejects.toThrow('metadata activation failed')

    const [tombstone] = await store.listAllImages()
    expect(tombstone?.deletedAt).toBe(baseNow)
    expect(await store.getImageBlob(tombstone.id, 'original')).not.toBeNull()
  })

  it('removes image rows whose note was already purged', async () => {
    const { store, repository, notes } = await createHarness()
    const imported = await repository.importImage({
      noteId,
      file: new Blob([bytesOf(9)], { type: 'image/jpeg' }),
    })
    notes.delete(noteId)

    await repository.recoverPendingImageOperations()

    expect(await store.getImageMeta(imported.imageId)).toBeNull()
    expect(await store.getImageBlob(imported.imageId, 'original')).toBeNull()
  })

  it('locking twice is idempotent', async () => {
    const { store, repository } = await createHarness()
    const imported = await repository.importImage({ noteId, file: new Blob([bytesOf(9)], { type: 'image/jpeg' }) })

    await repository.lockNoteImages(noteId)
    const firstPass = await blobBytes(
      (await store.getImageBlob(imported.imageId, 'original')) as Blob,
    )

    await repository.lockNoteImages(noteId)
    const secondPass = await blobBytes(
      (await store.getImageBlob(imported.imageId, 'original')) as Blob,
    )

    // No double encryption: ciphertext is untouched by the second pass.
    expect(secondPass).toEqual(firstPass)
    const decrypted = await repository.getImageBlob(imported.imageId, 'original')
    expect(await blobBytes(decrypted as Blob)).toEqual(bytesOf(1))
  })

  it('converges after a crash between meta flip and staged promotion', async () => {
    const { store, repository } = await createHarness()
    const imported = await repository.importImage({ noteId, file: new Blob([bytesOf(9)], { type: 'image/jpeg' }) })

    await repository.lockNoteImages(noteId)

    // Simulate the crash window: ciphertext demoted back to staged, stale
    // plaintext sitting at the tier key, meta already flipped to encrypted.
    const ciphertext = (await store.getImageBlob(imported.imageId, 'original')) as Blob
    await store.putImageBlob(imported.imageId, 'original.staged', ciphertext)
    await store.putImageBlob(
      imported.imageId,
      'original',
      new Blob([bytesOf(1)], { type: 'image/jpeg' }),
    )

    await repository.lockNoteImages(noteId)

    expect(await store.getImageBlob(imported.imageId, 'original.staged')).toBeNull()
    const decrypted = await repository.getImageBlob(imported.imageId, 'original')
    expect(await blobBytes(decrypted as Blob)).toEqual(bytesOf(1))
  })

  it('purgeNoteImages removes metas and blobs for the whole note', async () => {
    const { store, repository } = await createHarness()
    const first = await repository.importImage({ noteId, file: new Blob([bytesOf(1)], { type: 'image/jpeg' }) })
    const second = await repository.importImage({ noteId, file: new Blob([bytesOf(2)], { type: 'image/jpeg' }) })
    const foreign = await repository.importImage({ noteId: otherNoteId, file: new Blob([bytesOf(3)], { type: 'image/jpeg' }) })

    await repository.purgeNoteImages(noteId)

    expect(await store.getImageMeta(first.imageId)).toBeNull()
    expect(await store.getImageMeta(second.imageId)).toBeNull()
    expect(store.blobs.size).toBe(3)
    expect(await store.getImageMeta(foreign.imageId)).not.toBeNull()
  })

  it('rejects malformed ids from the id factory', async () => {
    const store = new MemoryImagesStore()

    const repository = new DefaultImageRepository({
      localImagesStore: store,
      imageProcessor: fakeProcessor(),
      localNotesStore: {
        getCryptoProfile: async () => null,
        setCryptoProfile: async () => undefined,
        getNote: async () =>
          createDraftLocalNote({
            deviceId,
            id: noteId,
            now: baseNow,
            title: 'Malformed image id',
            userId,
          }),
        listNotes: async () => [] as NoteListItem[],
        listDeletedNotes: async () => [] as NoteListItem[],
      },
      userId,
      deviceId,
      idFactory: () => '',
    })

    await expect(
      repository.importImage({ noteId, file: new Blob([bytesOf(1)], { type: 'image/jpeg' }) }),
    ).rejects.toThrow()
    expect(imageIdSchema.safeParse('image_ok').success).toBe(true)
  })
})
