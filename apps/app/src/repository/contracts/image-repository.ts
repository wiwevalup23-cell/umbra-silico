import type { LiveQuery } from '@/repository/contracts/live-query'
import type {
  ImageId,
  ImageTier,
  LocalImageMeta,
  LockCredentials,
  NoteId,
  NoteImageListItem,
} from '@/shared/contracts'

export type ImportImageInput = {
  noteId: NoteId
  file: Blob
  fileName?: string | null
}

export type ImportedImage = {
  imageId: ImageId
  width: number
  height: number
}

export type BackupImagePayload = {
  meta: LocalImageMeta
  tiers: Record<string, Uint8Array>
}

export interface ImageRepository {
  liveNoteImages(noteId: NoteId): LiveQuery<NoteImageListItem[]>
  importImage(input: ImportImageInput): Promise<ImportedImage>
  // Decrypts on demand; falls back display→original and thumb→display→original
  // when a rendition is missing.
  getImageBlob(imageId: ImageId, tier: ImageTier): Promise<Blob | null>
  // Tombstones stored images the saved document no longer references and
  // restores referenced-but-tombstoned ones (undo support).
  reconcileNoteImages(noteId: NoteId, referencedImageIds: ImageId[]): Promise<void>
  prepareNoteImagesLock(noteId: NoteId, credentials: LockCredentials): Promise<void>
  commitPreparedNoteImagesLock(noteId: NoteId): Promise<void>
  rollbackPreparedNoteImagesLock(noteId: NoteId): Promise<void>
  lockNoteImages(noteId: NoteId): Promise<void>
  unlockSweep(noteId: NoteId): Promise<void>
  purgeNoteImages(noteId: NoteId): Promise<void>
  purgeExpiredImages(): Promise<number>
  recoverPendingImageOperations(): Promise<void>
  readBackupImages(): Promise<BackupImagePayload[]>
  /** Adds images whose id is not present yet; existing ones are left alone. */
  restoreBackupImages(images: readonly BackupImagePayload[]): Promise<number>
}
