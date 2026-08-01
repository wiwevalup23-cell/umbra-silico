import { z } from 'zod'
import {
  localCryptoProfileSchema,
  localFolderSchema,
  localImageMetaSchema,
  localNoteSchema,
} from '@/shared/contracts'

export const backupFormatId = 'umbra-silico.backup'
export const backupFormatVersion = 1

export const backupImageSchema = z.object({
  meta: localImageMetaSchema,
  /** Base64 blob per stored tier, exactly as it sits on disk. */
  tiers: z.record(z.string(), z.string()),
})

/**
 * A complete, self-contained copy of a local library.
 *
 * Locked notes travel as the ciphertext they already are, together with the
 * crypto profile that wraps their master key. That keeps a backup safe to
 * store anywhere while remaining fully restorable with the master password or
 * the recovery key — exporting plaintext would quietly undo the encryption
 * the user asked for.
 */
export const backupBundleSchema = z.object({
  format: z.literal(backupFormatId),
  version: z.literal(backupFormatVersion),
  createdAt: z.string().min(1),
  appVersion: z.string().min(1),
  cryptoProfile: localCryptoProfileSchema.nullable(),
  folders: z.array(localFolderSchema),
  notes: z.array(localNoteSchema),
  images: z.array(backupImageSchema),
})

export type BackupBundle = z.infer<typeof backupBundleSchema>
export type BackupImage = z.infer<typeof backupImageSchema>

export type BackupContents = {
  folders: number
  images: number
  lockedNotes: number
  notes: number
}

export function describeBackup(bundle: BackupBundle): BackupContents {
  return {
    folders: bundle.folders.length,
    images: bundle.images.length,
    lockedNotes: bundle.notes.filter((note) => note.isLocked).length,
    notes: bundle.notes.length,
  }
}

export function parseBackupBundle(value: unknown): BackupBundle {
  const parsed = backupBundleSchema.safeParse(value)

  if (!parsed.success) {
    const looksLikeBackup =
      typeof value === 'object' && value !== null && 'format' in value

    throw new Error(
      looksLikeBackup
        ? 'This backup was written by an incompatible version of Umbra Silico.'
        : 'This file is not an Umbra Silico backup.',
    )
  }

  return parsed.data
}
