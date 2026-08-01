import type {
  BackupImagePayload,
  ImageRepository,
  NoteBackupRestoreReport,
  NoteRepository,
} from '@/repository/contracts'
import {
  backupFormatId,
  backupFormatVersion,
  parseBackupBundle,
  type BackupBundle,
  type BackupImage,
} from '@/backup/backup-format'

export type BackupDependencies = {
  imageRepository?: ImageRepository | null
  noteRepository: NoteRepository
}

export type CreateBackupOptions = {
  appVersion?: string
  /** Photos dominate the file size, so the caller decides. */
  includeImages?: boolean
  now?: () => string
}

export type RestoreBackupReport = NoteBackupRestoreReport & {
  imagesRestored: number
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000

  // Chunked because String.fromCharCode(...bytes) blows the argument limit on
  // anything larger than a small thumbnail.
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }

  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

function encodeImage(image: BackupImagePayload): BackupImage {
  return {
    meta: image.meta,
    tiers: Object.fromEntries(
      Object.entries(image.tiers).map(([tier, bytes]) => [
        tier,
        bytesToBase64(bytes as Uint8Array),
      ]),
    ),
  }
}

function decodeImage(image: BackupImage): BackupImagePayload {
  return {
    meta: image.meta,
    tiers: Object.fromEntries(
      Object.entries(image.tiers).map(([tier, encoded]) => [tier, base64ToBytes(encoded)]),
    ),
  }
}

export async function createBackup(
  dependencies: BackupDependencies,
  options: CreateBackupOptions = {},
): Promise<BackupBundle> {
  const { cryptoProfile, folders, notes } =
    await dependencies.noteRepository.readBackupData()
  const includeImages = options.includeImages ?? true
  const images =
    includeImages && dependencies.imageRepository
      ? await dependencies.imageRepository.readBackupImages()
      : []

  return {
    format: backupFormatId,
    version: backupFormatVersion,
    createdAt: (options.now ?? (() => new Date().toISOString()))(),
    appVersion: options.appVersion ?? 'unknown',
    cryptoProfile,
    folders,
    notes,
    images: images.map(encodeImage),
  }
}

export async function restoreBackup(
  dependencies: BackupDependencies,
  value: unknown,
): Promise<RestoreBackupReport> {
  const bundle = parseBackupBundle(value)
  const report = await dependencies.noteRepository.restoreBackupData({
    cryptoProfile: bundle.cryptoProfile,
    folders: bundle.folders,
    notes: bundle.notes,
  })
  const imagesRestored = dependencies.imageRepository
    ? await dependencies.imageRepository.restoreBackupImages(
        bundle.images.map(decodeImage),
      )
    : 0

  return { ...report, imagesRestored }
}

export function backupFileName(createdAt: string): string {
  const date = new Date(createdAt)
  const stamp = Number.isNaN(date.getTime())
    ? 'unknown'
    : date.toISOString().slice(0, 10)

  return `umbra-silico-backup-${stamp}.json`
}
