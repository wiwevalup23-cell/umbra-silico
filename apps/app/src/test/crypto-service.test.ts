import { describe, expect, it } from 'vitest'
import { WebCryptoService } from '@/crypto'
import { userIdSchema } from '@/shared/contracts'

const userId = userIdSchema.parse('crypto_user')
const now = '2026-07-05T14:00:00.000Z'
const masterPassword = 'correct horse battery staple'

describe('WebCryptoService', () => {
  it('wraps the master key with PBKDF2 and encrypts note payloads with per-note DEKs', async () => {
    const cryptoService = new WebCryptoService()
    const { masterKey, profile } = await cryptoService.createMasterKeyProfile({
      credentials: { masterPassword },
      now,
      userId,
    })
    const plaintextPayload = JSON.stringify({
      title: 'Secret title',
      body: 'Secret body',
    })

    const encrypted = await cryptoService.encryptNotePayload(plaintextPayload, masterKey)

    expect(profile).toMatchObject({
      userId,
      version: 1,
      kdf: {
        name: 'PBKDF2',
        hash: 'SHA-256',
      },
    })
    expect(encrypted.encryptedPayload).not.toContain('Secret')
    expect(encrypted.encryption).toMatchObject({
      version: 1,
      algorithm: 'AES-GCM-256',
    })

    const unlockedMasterKey = await cryptoService.unlockMasterKey(profile, {
      masterPassword,
    })

    await expect(
      cryptoService.decryptNotePayload(
        encrypted.encryptedPayload,
        encrypted.encryption,
        unlockedMasterKey,
      ),
    ).resolves.toBe(plaintextPayload)
    await expect(
      cryptoService.unlockMasterKey(profile, {
        masterPassword: 'wrong horse battery staple',
      }),
    ).rejects.toThrow()
  })
})
