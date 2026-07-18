import type { ImageId, ImageTier, LocalImageMeta, NoteId } from '@/shared/contracts'

// `.staged` keys are a storage-level namespace used by the lock flow to write
// ciphertext next to the plaintext tier before atomically promoting it.
export type ImageBlobKey = ImageTier | `${ImageTier}.staged`

export interface LocalImagesStore {
  listAllImages(): Promise<LocalImageMeta[]>
  listNoteImages(noteId: NoteId): Promise<LocalImageMeta[]>
  listAllImagesForNote(noteId: NoteId): Promise<LocalImageMeta[]>
  getImageMeta(id: ImageId): Promise<LocalImageMeta | null>
  putImageMeta(meta: LocalImageMeta): Promise<void>
  getImageBlob(id: ImageId, key: ImageBlobKey): Promise<Blob | null>
  putImageBlob(id: ImageId, key: ImageBlobKey, blob: Blob): Promise<void>
  deleteImageBlob(id: ImageId, key: ImageBlobKey): Promise<void>
  promoteStagedImageBlob(id: ImageId, tier: ImageTier): Promise<void>
  markImageDeleted(id: ImageId, deletedAt: string): Promise<void>
  restoreImage(id: ImageId): Promise<void>
  hardDeleteImage(id: ImageId): Promise<void>
  listDeletedImagesBefore(cutoffIso: string): Promise<LocalImageMeta[]>
}

// Raw binary persistence used by the SQLite images store: the Tauri SQL plugin
// binds only strings/numbers, so image bytes live outside the database (files
// under appData on Tauri). Keys look like `${imageId}/${tier}.bin`.
export interface BinaryBlobStore {
  read(key: string): Promise<Uint8Array | null>
  write(key: string, bytes: Uint8Array): Promise<void>
  remove(key: string): Promise<void>
  move(sourceKey: string, destinationKey: string): Promise<void>
}
