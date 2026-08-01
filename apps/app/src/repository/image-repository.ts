import {
  createCryptoService,
  createKeyring,
  type CryptoService,
  type Keyring,
} from '@/crypto'
import type { ImageProcessor } from '@/images'
import type { LocalImagesStore, LocalNotesStore } from '@/local-store/contracts'
import type {
  BackupImagePayload,
  ImageRepository,
  ImportedImage,
  ImportImageInput,
} from '@/repository/contracts/image-repository'
import { LiveQueryRegistry, StoreBackedLiveQuery } from '@/repository/live-query'
import {
  deviceIdSchema,
  imageIdSchema,
  imageTierValues,
  localImageMetaSchema,
  lockCredentialsSchema,
  noteIdSchema,
  toNoteImageListItem,
  userIdSchema,
  type DeviceId,
  type ImageId,
  type ImageTier,
  type LocalImageMeta,
  type LockCredentials,
  type NoteEncryptionMetadata,
  type NoteId,
  type NoteImageListItem,
  type UserId,
} from '@/shared/contracts'

export type ImageRepositoryClock = () => string
export type ImageRepositoryIdFactory = (prefix: 'image') => string

export type DefaultImageRepositoryDependencies = {
  localImagesStore: LocalImagesStore
  imageProcessor: ImageProcessor
  localNotesStore: Pick<
    LocalNotesStore,
    | 'getCryptoProfile'
    | 'setCryptoProfile'
    | 'getNote'
    | 'listNotes'
    | 'listDeletedNotes'
  >
  cryptoService?: CryptoService
  keyring?: Keyring
  userId: UserId | string
  deviceId: DeviceId | string
  clock?: ImageRepositoryClock
  idFactory?: ImageRepositoryIdFactory
  gracePeriodMs?: number
  // Reserved for the future sync module: the local-only build never enqueues
  // image sync operations.
  enqueueSyncOps?: boolean
}

const defaultClock: ImageRepositoryClock = () => new Date().toISOString()
const defaultIdFactory: ImageRepositoryIdFactory = (prefix) =>
  `${prefix}_${globalThis.crypto.randomUUID()}`
const defaultGracePeriodMs = 7 * 24 * 60 * 60 * 1000

const tierFallbackOrder: Record<ImageTier, ImageTier[]> = {
  original: ['original'],
  display: ['display', 'original'],
  thumb: ['thumb', 'display', 'original'],
}

export class DefaultImageRepository implements ImageRepository {
  private readonly store: LocalImagesStore
  private readonly processor: ImageProcessor
  private readonly notesStore: DefaultImageRepositoryDependencies['localNotesStore']
  private readonly cryptoService: CryptoService
  private readonly keyring: Keyring
  private readonly userId: UserId
  private readonly deviceId: DeviceId
  private readonly clock: ImageRepositoryClock
  private readonly idFactory: ImageRepositoryIdFactory
  private readonly gracePeriodMs: number
  private readonly liveQueries = new LiveQueryRegistry()

  constructor(dependencies: DefaultImageRepositoryDependencies) {
    this.store = dependencies.localImagesStore
    this.processor = dependencies.imageProcessor
    this.notesStore = dependencies.localNotesStore
    this.cryptoService = dependencies.cryptoService ?? createCryptoService()
    this.keyring = dependencies.keyring ?? createKeyring(this.cryptoService)
    this.userId = userIdSchema.parse(dependencies.userId)
    this.deviceId = deviceIdSchema.parse(dependencies.deviceId)
    this.clock = dependencies.clock ?? defaultClock
    this.idFactory = dependencies.idFactory ?? defaultIdFactory
    this.gracePeriodMs = dependencies.gracePeriodMs ?? defaultGracePeriodMs
  }

  liveNoteImages(noteId: NoteId) {
    const parsedNoteId = noteIdSchema.parse(noteId)
    const liveQuery = new StoreBackedLiveQuery<NoteImageListItem[]>({
      initialSnapshot: [],
      loadSnapshot: async () =>
        (await this.store.listNoteImages(parsedNoteId)).map(toNoteImageListItem),
      onDispose: (disposed) => this.liveQueries.unregister(disposed),
        onRetain: (retained) => this.liveQueries.register(retained),
      tags: [`note:${parsedNoteId}`],
    })

    this.liveQueries.register(liveQuery)
    return liveQuery
  }

  async importImage(input: ImportImageInput): Promise<ImportedImage> {
    const noteId = noteIdSchema.parse(input.noteId)
    const note = await this.notesStore.getNote(noteId)

    if (!note || note.userId !== this.userId) {
      throw new Error(`Note ${noteId} does not exist.`)
    }

    const processed = await this.processor.process(input.file)
    const imageId = imageIdSchema.parse(this.idFactory('image'))
    const now = this.clock()
    const processedTiers: Array<{
      blob: Blob
      tier: ImageTier
    }> = [
      { blob: processed.original.blob, tier: 'original' },
      ...(processed.display
        ? [{ blob: processed.display.blob, tier: 'display' as const }]
        : []),
      { blob: processed.thumb.blob, tier: 'thumb' },
    ]
    const encryption: Partial<Record<ImageTier, NoteEncryptionMetadata>> = {}
    const blobs = new Map<ImageTier, Blob>()

    if (note.isLocked) {
      const masterKey = await this.requireCachedMasterKey()

      for (const { blob, tier } of processedTiers) {
        const encrypted = await this.cryptoService.encryptBinaryPayload(
          new Uint8Array(await blob.arrayBuffer()),
          masterKey,
        )
        encryption[tier] = encrypted.encryption
        blobs.set(
          tier,
          new Blob([encrypted.ciphertext as BlobPart], {
            type: 'application/octet-stream',
          }),
        )
      }
    } else {
      for (const { blob, tier } of processedTiers) {
        blobs.set(tier, blob)
      }
    }

    const meta = localImageMetaSchema.parse({
      id: imageId,
      noteId,
      userId: this.userId,
      sourceFileName: input.fileName ?? null,
      mimeType: processed.original.info.mimeType,
      byteSize: processed.original.info.byteSize,
      width: processed.width,
      height: processed.height,
      renditions: {
        original: processed.original.info,
        ...(processed.display ? { display: processed.display.info } : {}),
        thumb: processed.thumb.info,
      },
      isEncrypted: note.isLocked,
      encryption: note.isLocked ? encryption : null,
      createdAt: now,
      deletedAt: null,
      localRevision: 0,
      syncStatus: 'dirty',
      deviceId: this.deviceId,
    })

    // The initial tombstone is a durable import marker. A crash can leave
    // partial blobs, but never an undiscoverable blob: the normal expiration
    // sweep eventually hard-deletes this row and every tier.
    await this.store.putImageMeta({ ...meta, deletedAt: now })

    try {
      for (const [tier, blob] of blobs) {
        await this.store.putImageBlob(imageId, tier, blob)
      }

      await this.store.putImageMeta(meta)
    } catch (error) {
      // Best effort now; if cleanup itself fails, the durable tombstone above
      // remains available to the startup expiration sweep.
      try {
        await this.store.hardDeleteImage(imageId)
      } catch {
        // The tombstone is deliberately retained for retry.
      }
      throw error
    }

    await this.invalidateNote(noteId)

    return {
      imageId,
      width: processed.width,
      height: processed.height,
    }
  }

  async getImageBlob(imageId: ImageId, tier: ImageTier): Promise<Blob | null> {
    const meta = await this.store.getImageMeta(imageId)

    if (!meta) {
      return null
    }

    for (const candidate of tierFallbackOrder[tier]) {
      if (candidate !== 'original' && !meta.renditions[candidate]) {
        continue
      }

      const blob = await this.store.getImageBlob(imageId, candidate)

      if (!blob) {
        continue
      }

      if (!meta.isEncrypted) {
        return blob
      }

      const encryption = meta.encryption?.[candidate]

      if (!encryption) {
        continue
      }

      const plaintext = await this.decryptBlob(blob, encryption)
      const mimeType = meta.renditions[candidate]?.mimeType ?? meta.mimeType

      return new Blob([plaintext as BlobPart], { type: mimeType })
    }

    return null
  }

  async reconcileNoteImages(noteId: NoteId, referencedImageIds: ImageId[]): Promise<void> {
    const parsedNoteId = noteIdSchema.parse(noteId)
    const referenced = new Set<string>(referencedImageIds)
    const all = await this.store.listAllImagesForNote(parsedNoteId)
    const now = this.clock()
    let changed = false

    for (const meta of all) {
      if (!referenced.has(meta.id) && meta.deletedAt === null) {
        await this.store.markImageDeleted(meta.id, now)
        changed = true
      } else if (referenced.has(meta.id) && meta.deletedAt !== null) {
        await this.store.restoreImage(meta.id)
        changed = true
      }
    }

    if (changed) {
      await this.invalidateNote(noteId)
    }
  }

  async lockNoteImages(noteId: NoteId): Promise<void> {
    const parsedNoteId = noteIdSchema.parse(noteId)
    await this.commitPreparedNoteImagesLock(parsedNoteId)
    const masterKey = await this.requireCachedMasterKey()
    await this.preparePlaintextImages(parsedNoteId, masterKey)
    await this.commitPreparedNoteImagesLock(parsedNoteId)

    await this.invalidateNote(parsedNoteId)
  }

  async prepareNoteImagesLock(
    noteId: NoteId,
    credentials: LockCredentials,
  ): Promise<void> {
    const parsedNoteId = noteIdSchema.parse(noteId)
    const note = await this.notesStore.getNote(parsedNoteId)

    if (!note || note.userId !== this.userId) {
      throw new Error(`Note ${parsedNoteId} does not exist.`)
    }

    const profile = await this.notesStore.getCryptoProfile(this.userId)
    const resolved = await this.keyring.resolveMasterKeyForLock({
      credentials: lockCredentialsSchema.parse(credentials),
      now: this.clock(),
      profile,
      userId: this.userId,
    })

    if (resolved.createdProfile) {
      await this.notesStore.setCryptoProfile(resolved.profile)
    }

    if (note.isLocked) {
      await this.commitPreparedNoteImagesLock(parsedNoteId)
    } else {
      await this.rollbackPreparedNoteImagesLock(parsedNoteId)
    }

    try {
      await this.preparePlaintextImages(parsedNoteId, resolved.masterKey)
      await this.assertPreparedImagesComplete(parsedNoteId)
    } catch (error) {
      await this.rollbackPreparedNoteImagesLock(parsedNoteId)
      throw error
    }
  }

  async commitPreparedNoteImagesLock(noteId: NoteId): Promise<void> {
    const parsedNoteId = noteIdSchema.parse(noteId)
    await this.assertPreparedImagesComplete(parsedNoteId)
    const all = await this.store.listAllImagesForNote(parsedNoteId)

    for (const meta of all) {
      if (meta.isEncrypted) {
        await this.promoteStagedBlobs(meta)
        continue
      }

      if (meta.encryption === null) {
        continue
      }

      const lockedMeta = localImageMetaSchema.parse({
        ...meta,
        isEncrypted: true,
        localRevision: meta.localRevision + 1,
        syncStatus: 'dirty',
      })

      await this.store.putImageMeta(lockedMeta)
      await this.promoteStagedBlobs(lockedMeta)
    }
  }

  async rollbackPreparedNoteImagesLock(noteId: NoteId): Promise<void> {
    const parsedNoteId = noteIdSchema.parse(noteId)
    const all = await this.store.listAllImagesForNote(parsedNoteId)

    for (const meta of all) {
      if (meta.isEncrypted) {
        continue
      }

      for (const tier of imageTierValues) {
        await this.store.deleteImageBlob(meta.id, `${tier}.staged`)
      }

      if (meta.encryption !== null) {
        await this.store.putImageMeta({
          ...meta,
          encryption: null,
        })
      }
    }
  }

  async unlockSweep(noteId: NoteId): Promise<void> {
    // Self-heal after a failed lock: encrypt any image the lock pass missed.
    await this.lockNoteImages(noteId)
  }

  async purgeNoteImages(noteId: NoteId): Promise<void> {
    const parsedNoteId = noteIdSchema.parse(noteId)
    const all = await this.store.listAllImagesForNote(parsedNoteId)

    for (const meta of all) {
      await this.store.hardDeleteImage(meta.id)
    }

    if (all.length > 0) {
      await this.invalidateNote(parsedNoteId)
    }
  }

  /**
   * Reads every stored image, tier by tier, exactly as persisted. Encrypted
   * tiers stay encrypted: a backup must not become a way to smuggle locked
   * attachments out in the clear.
   */
  async readBackupImages(): Promise<BackupImagePayload[]> {
    const all = await this.store.listAllImages()
    const payloads: BackupImagePayload[] = []

    for (const meta of all) {
      const tiers: Record<string, Uint8Array> = {}

      for (const tier of imageTierValues) {
        const blob = await this.store.getImageBlob(meta.id, tier)

        if (blob) {
          tiers[tier] = new Uint8Array(await blob.arrayBuffer())
        }
      }

      if (Object.keys(tiers).length > 0) {
        payloads.push({ meta, tiers })
      }
    }

    return payloads
  }

  async restoreBackupImages(images: readonly BackupImagePayload[]): Promise<number> {
    let restored = 0

    for (const image of images) {
      if (await this.store.getImageMeta(image.meta.id)) {
        continue
      }

      for (const [tier, bytes] of Object.entries(image.tiers)) {
        await this.store.putImageBlob(
          image.meta.id,
          tier as ImageTier,
          new Blob([bytes as BlobPart], { type: image.meta.mimeType }),
        )
      }

      // Metadata last: an interrupted restore then leaves orphan blobs, which
      // the existing GC sweeps, rather than metadata pointing at missing bytes.
      await this.store.putImageMeta(image.meta)
      restored += 1
    }

    if (restored > 0) {
      await this.refreshLiveQueries()
    }

    return restored
  }

  async purgeExpiredImages(): Promise<number> {
    const cutoff = new Date(Date.parse(this.clock()) - this.gracePeriodMs).toISOString()
    const expired = await this.store.listDeletedImagesBefore(cutoff)

    for (const meta of expired) {
      await this.store.hardDeleteImage(meta.id)
    }

    if (expired.length > 0) {
      await this.refreshLiveQueries()
    }

    return expired.length
  }

  async recoverPendingImageOperations(): Promise<void> {
    const notes = [
      ...(await this.notesStore.listNotes()),
      ...(await this.notesStore.listDeletedNotes()),
    ]
    const knownNoteIds = new Set(notes.map((note) => note.id))

    for (const note of notes) {
      if (note.isLocked) {
        await this.commitPreparedNoteImagesLock(note.id)
      } else {
        await this.rollbackPreparedNoteImagesLock(note.id)
      }
    }

    // A note purge is intentionally committed before filesystem cleanup. If
    // cleanup was interrupted, this scan makes every remaining image retryable
    // on the next boot instead of leaving a permanent orphan.
    for (const meta of await this.store.listAllImages()) {
      if (!knownNoteIds.has(meta.noteId)) {
        try {
          await this.store.hardDeleteImage(meta.id)
        } catch {
          // A later boot retries the same still-discoverable metadata row.
        }
      }
    }
  }

  private async preparePlaintextImages(
    noteId: NoteId,
    masterKey: CryptoKey,
  ): Promise<void> {
    const all = await this.store.listAllImagesForNote(noteId)

    for (const meta of all) {
      if (!meta.isEncrypted && meta.encryption === null) {
        await this.prepareImageEncryption(meta, masterKey)
      }
    }
  }

  private async assertPreparedImagesComplete(noteId: NoteId): Promise<void> {
    const all = await this.store.listAllImagesForNote(noteId)

    // Preparation runs this before the note lock is published; commit repeats
    // it before flipping image metadata so corruption cannot produce a partial
    // promotion.
    for (const meta of all) {
      if (meta.isEncrypted || meta.encryption === null) {
        continue
      }

      for (const tier of this.storedTiers(meta)) {
        if (!meta.encryption[tier]) {
          throw new Error(`Prepared encryption metadata is missing for ${meta.id}/${tier}.`)
        }

        if (!(await this.store.getImageBlob(meta.id, `${tier}.staged`))) {
          throw new Error(`Prepared ciphertext is missing for ${meta.id}/${tier}.`)
        }
      }
    }
  }

  private async prepareImageEncryption(
    meta: LocalImageMeta,
    masterKey: CryptoKey,
  ): Promise<void> {
    const encryption: Partial<Record<ImageTier, NoteEncryptionMetadata>> = {}

    // Persist the pending marker before writing any staged bytes. Startup can
    // now either roll the preparation back (plain note) or finish it (locked
    // note), including after a process crash.
    await this.store.putImageMeta({ ...meta, encryption })

    for (const tier of this.storedTiers(meta)) {

      const blob = await this.store.getImageBlob(meta.id, tier)

      if (!blob) {
        throw new Error(`Image payload is missing for ${meta.id}/${tier}.`)
      }

      const plaintext = new Uint8Array(await blob.arrayBuffer())
      const encrypted = await this.cryptoService.encryptBinaryPayload(plaintext, masterKey)

      await this.store.putImageBlob(
        meta.id,
        `${tier}.staged`,
        new Blob([encrypted.ciphertext as BlobPart], { type: 'application/octet-stream' }),
      )
      encryption[tier] = encrypted.encryption
      await this.store.putImageMeta({ ...meta, encryption: { ...encryption } })
    }
  }

  private storedTiers(meta: LocalImageMeta): ImageTier[] {
    return imageTierValues.filter(
      (tier) => tier === 'original' || Boolean(meta.renditions[tier]),
    )
  }

  private async promoteStagedBlobs(meta: LocalImageMeta): Promise<void> {
    for (const tier of this.storedTiers(meta)) {
      await this.store.promoteStagedImageBlob(meta.id, tier)
    }
  }

  private async decryptBlob(
    blob: Blob,
    encryption: NoteEncryptionMetadata,
  ): Promise<Uint8Array> {
    const masterKey = await this.requireCachedMasterKey()
    const ciphertext = new Uint8Array(await blob.arrayBuffer())

    return this.cryptoService.decryptBinaryPayload(ciphertext, encryption, masterKey)
  }

  private async requireCachedMasterKey(): Promise<CryptoKey> {
    const profile = await this.notesStore.getCryptoProfile(this.userId)

    if (!profile) {
      throw new Error('Crypto profile is missing for this user.')
    }

    return this.keyring.unlockMasterKey({
      credentials: {
        localPin: 'session',
      },
      profile,
      userId: this.userId,
    })
  }

  private invalidateNote(noteId: NoteId): Promise<void> {
    return this.liveQueries.invalidate([`note:${noteId}`])
  }

  /** Used by sweeps that can touch images belonging to any note. */
  private refreshLiveQueries(): Promise<void> {
    return this.liveQueries.refreshAll()
  }
}
