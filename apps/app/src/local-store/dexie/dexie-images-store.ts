import type { ImageBlobKey, LocalImagesStore } from '@/local-store/contracts'
import { createDexieDatabase, type SiliconDexieDatabase } from '@/local-store/dexie/dexie-db'
import { imageMetaToRow, rowToImageMeta } from '@/local-store/serialization'
import type { ImageId, ImageTier, LocalImageMeta, NoteId } from '@/shared/contracts'

export type DexieImagesStoreOptions = {
  databaseName?: string
  database?: SiliconDexieDatabase
}

export class DexieImagesStore implements LocalImagesStore {
  readonly db: SiliconDexieDatabase

  constructor(options: DexieImagesStoreOptions = {}) {
    this.db = options.database ?? createDexieDatabase(options.databaseName)
  }

  async listAllImages() {
    return (await this.db.images.toArray()).map(rowToImageMeta)
  }

  async listNoteImages(noteId: NoteId) {
    const rows = await this.db.images.where('noteId').equals(noteId).toArray()

    return rows
      .filter((row) => row.deletedAt === null)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(rowToImageMeta)
  }

  async listAllImagesForNote(noteId: NoteId) {
    const rows = await this.db.images.where('noteId').equals(noteId).toArray()

    return rows
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(rowToImageMeta)
  }

  async getImageMeta(id: ImageId) {
    const row = await this.db.images.get(id)
    return row ? rowToImageMeta(row) : null
  }

  async putImageMeta(meta: LocalImageMeta) {
    await this.db.images.put(imageMetaToRow(meta))
  }

  async getImageBlob(id: ImageId, key: ImageBlobKey) {
    const row = await this.db.imageBlobs.get([id, key])

    if (!row) {
      return null
    }

    return new Blob([row.bytes], { type: row.mimeType })
  }

  async putImageBlob(id: ImageId, key: ImageBlobKey, blob: Blob) {
    await this.db.imageBlobs.put({
      imageId: id,
      tier: key,
      mimeType: blob.type,
      bytes: await blob.arrayBuffer(),
    })
  }

  async deleteImageBlob(id: ImageId, key: ImageBlobKey) {
    await this.db.imageBlobs.delete([id, key])
  }

  async promoteStagedImageBlob(id: ImageId, tier: ImageTier) {
    await this.db.transaction('rw', this.db.imageBlobs, async () => {
      const staged = await this.db.imageBlobs.get([id, `${tier}.staged`])

      if (!staged) {
        return
      }

      await this.db.imageBlobs.put({
        ...staged,
        tier,
      })
      await this.db.imageBlobs.delete([id, `${tier}.staged`])
    })
  }

  async markImageDeleted(id: ImageId, deletedAt: string) {
    await this.db.images.update(id, {
      deletedAt,
      syncStatus: 'dirty',
    })
  }

  async restoreImage(id: ImageId) {
    await this.db.images.update(id, {
      deletedAt: null,
      syncStatus: 'dirty',
    })
  }

  async hardDeleteImage(id: ImageId) {
    await this.db.transaction('rw', this.db.images, this.db.imageBlobs, async () => {
      await this.db.imageBlobs.where('imageId').equals(id).delete()
      await this.db.images.delete(id)
    })
  }

  async listDeletedImagesBefore(cutoffIso: string) {
    const rows = await this.db.images.toArray()

    return rows
      .filter((row) => row.deletedAt !== null && row.deletedAt < cutoffIso)
      .map(rowToImageMeta)
  }
}

export function createDexieImagesStore(options?: DexieImagesStoreOptions): DexieImagesStore {
  return new DexieImagesStore(options)
}
