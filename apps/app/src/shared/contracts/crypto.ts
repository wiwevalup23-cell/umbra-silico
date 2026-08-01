import { z } from 'zod'

export const encryptionAlgorithmSchema = z.literal('AES-GCM-256')
export type EncryptionAlgorithm = z.infer<typeof encryptionAlgorithmSchema>

export const noteEncryptionMetadataSchema = z.object({
  version: z.literal(1),
  algorithm: encryptionAlgorithmSchema,
  payloadNonce: z.string().min(1),
  wrappedDek: z.string().min(1),
  wrapNonce: z.string().min(1),
})

export type NoteEncryptionMetadata = z.infer<typeof noteEncryptionMetadataSchema>

export const pbkdf2ParamsSchema = z.object({
  name: z.literal('PBKDF2'),
  hash: z.literal('SHA-256'),
  iterations: z.number().int().min(100000),
})

export const argon2idParamsSchema = z.object({
  name: z.literal('Argon2id'),
  memoryKiB: z.number().int().positive(),
  iterations: z.number().int().positive(),
  parallelism: z.number().int().positive(),
})

export const passwordKdfParamsSchema = z.discriminatedUnion('name', [
  pbkdf2ParamsSchema,
  argon2idParamsSchema,
])

export type PasswordKdfParams = z.infer<typeof passwordKdfParamsSchema>

/**
 * A second, independent wrapping of the master key.
 *
 * Without it a forgotten master password is terminal: the key that decrypts
 * every locked note exists only as ciphertext wrapped by that password. The
 * recovery key is high-entropy and shown to the user exactly once.
 */
export const cryptoRecoveryWrapSchema = z.object({
  kdf: passwordKdfParamsSchema,
  salt: z.string().min(1),
  wrappedMasterKey: z.string().min(1),
  wrapNonce: z.string().min(1),
})

export type CryptoRecoveryWrap = z.infer<typeof cryptoRecoveryWrapSchema>

export const localCryptoProfileSchema = z.object({
  userId: z.string().min(1),
  version: z.literal(1),
  kdf: passwordKdfParamsSchema,
  salt: z.string().min(1),
  wrappedMasterKey: z.string().min(1),
  wrapNonce: z.string().min(1),
  // Absent on profiles created before recovery keys existed.
  recovery: cryptoRecoveryWrapSchema.nullable().default(null),
  updatedAt: z.string().min(1),
})

export type LocalCryptoProfile = z.infer<typeof localCryptoProfileSchema>

export const lockCredentialsSchema = z.object({
  masterPassword: z.string().min(8),
})

export type LockCredentials = z.infer<typeof lockCredentialsSchema>

export const unlockCredentialsSchema = z
  .object({
    masterPassword: z.string().min(8).optional(),
    localPin: z.string().min(4).max(12).optional(),
    recoveryKey: z.string().min(1).optional(),
  })
  .refine((value) => value.masterPassword || value.localPin || value.recoveryKey, {
    message: 'Unlock requires a master password, a recovery key or a local PIN.',
  })

export type UnlockCredentials = z.infer<typeof unlockCredentialsSchema>

export const unlockedNoteSessionSchema = z.object({
  noteId: z.string().min(1),
  expiresAt: z.string().min(1),
})

export type UnlockedNoteSession = z.infer<typeof unlockedNoteSessionSchema>
