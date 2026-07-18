import type {
  BinaryBlobStore,
  ImageBlobKey,
  LocalImagesStore,
  StoredImageMetaRow,
} from '@/local-store/contracts'
import { imageMetaToRow, rowToImageMeta } from '@/local-store/serialization'
import type { SqlBindValue, SqlDatabase } from '@/local-store/sqlite/sqlite-driver'
import type { ImageId, ImageTier, LocalImageMeta, NoteId } from '@/shared/contracts'
import { imageTierValues } from '@/shared/contracts'

const imageColumns = `
  id,
  note_id as noteId,
  user_id as userId,
  source_file_name as sourceFileName,
  mime_type as mimeType,
  byte_size as byteSize,
  width,
  height,
  renditions,
  is_encrypted as isEncrypted,
  encryption,
  created_at as createdAt,
  deleted_at as deletedAt,
  local_revision as localRevision,
  sync_status as syncStatus,
  device_id as deviceId
`

function imageBindValues(row: StoredImageMetaRow): SqlBindValue[] {
  return [
    row.id,
    row.noteId,
    row.userId,
    row.sourceFileName,
    row.mimeType,
    row.byteSize,
    row.width,
    row.height,
    row.renditions,
    row.isEncrypted,
    row.encryption,
    row.createdAt,
    row.deletedAt,
    row.localRevision,
    row.syncStatus,
    row.deviceId,
  ]
}

function blobKey(id: ImageId, tier: string): string {
  return `${id}/${tier}.bin`
}

export class SqliteImagesStore implements LocalImagesStore {
  private readonly db: SqlDatabase
  private readonly blobs: BinaryBlobStore

  constructor(db: SqlDatabase, blobs: BinaryBlobStore) {
    this.db = db
    this.blobs = blobs
  }

  async listAllImages() {
    const rows = await this.db.select<StoredImageMetaRow>(
      `select ${imageColumns}
       from images
       order by created_at asc`,
    )

    return rows.map(rowToImageMeta)
  }

  async listNoteImages(noteId: NoteId) {
    const rows = await this.db.select<StoredImageMetaRow>(
      `select ${imageColumns}
       from images
       where note_id = $1 and deleted_at is null
       order by created_at asc`,
      [noteId],
    )

    return rows.map(rowToImageMeta)
  }

  async listAllImagesForNote(noteId: NoteId) {
    const rows = await this.db.select<StoredImageMetaRow>(
      `select ${imageColumns}
       from images
       where note_id = $1
       order by created_at asc`,
      [noteId],
    )

    return rows.map(rowToImageMeta)
  }

  async getImageMeta(id: ImageId) {
    const rows = await this.db.select<StoredImageMetaRow>(
      `select ${imageColumns}
       from images
       where id = $1
       limit 1`,
      [id],
    )

    return rows[0] ? rowToImageMeta(rows[0]) : null
  }

  async putImageMeta(meta: LocalImageMeta) {
    await this.db.execute(
      `insert into images (
         id, note_id, user_id, source_file_name, mime_type, byte_size,
         width, height, renditions, is_encrypted, encryption,
         created_at, deleted_at, local_revision, sync_status, device_id
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       on conflict(id) do update set
         note_id = excluded.note_id,
         user_id = excluded.user_id,
         source_file_name = excluded.source_file_name,
         mime_type = excluded.mime_type,
         byte_size = excluded.byte_size,
         width = excluded.width,
         height = excluded.height,
         renditions = excluded.renditions,
         is_encrypted = excluded.is_encrypted,
         encryption = excluded.encryption,
         created_at = excluded.created_at,
         deleted_at = excluded.deleted_at,
         local_revision = excluded.local_revision,
         sync_status = excluded.sync_status,
         device_id = excluded.device_id`,
      imageBindValues(imageMetaToRow(meta)),
    )
  }

  async getImageBlob(id: ImageId, key: ImageBlobKey) {
    const bytes = await this.blobs.read(blobKey(id, key))

    if (!bytes) {
      return null
    }

    const plainTier = key.endsWith('.staged') ? null : (key as ImageTier)
    const meta = await this.getImageMeta(id)
    const mimeType =
      !plainTier || !meta || meta.isEncrypted
        ? 'application/octet-stream'
        : (meta.renditions[plainTier]?.mimeType ?? 'application/octet-stream')

    return new Blob([bytes as BlobPart], { type: mimeType })
  }

  async putImageBlob(id: ImageId, key: ImageBlobKey, blob: Blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    await this.blobs.write(blobKey(id, key), bytes)
  }

  async deleteImageBlob(id: ImageId, key: ImageBlobKey) {
    await this.blobs.remove(blobKey(id, key))
  }

  async promoteStagedImageBlob(id: ImageId, tier: ImageTier) {
    await this.blobs.move(blobKey(id, `${tier}.staged`), blobKey(id, tier))
  }

  async markImageDeleted(id: ImageId, deletedAt: string) {
    await this.db.execute(
      `update images
       set deleted_at = $1, sync_status = $2
       where id = $3`,
      [deletedAt, 'dirty', id],
    )
  }

  async restoreImage(id: ImageId) {
    await this.db.execute(
      `update images
       set deleted_at = null, sync_status = $1
       where id = $2`,
      ['dirty', id],
    )
  }

  async hardDeleteImage(id: ImageId) {
    for (const tier of imageTierValues) {
      await this.blobs.remove(blobKey(id, tier))
      await this.blobs.remove(blobKey(id, `${tier}.staged`))
    }

    await this.db.execute('delete from images where id = $1', [id])
  }

  async listDeletedImagesBefore(cutoffIso: string) {
    const rows = await this.db.select<StoredImageMetaRow>(
      `select ${imageColumns}
       from images
       where deleted_at is not null and deleted_at < $1
       order by deleted_at asc`,
      [cutoffIso],
    )

    return rows.map(rowToImageMeta)
  }
}

export function createSqliteImagesStore(
  db: SqlDatabase,
  blobs: BinaryBlobStore,
): SqliteImagesStore {
  return new SqliteImagesStore(db, blobs)
}
