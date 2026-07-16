import type {
  LocalCryptoProfile,
  LockCredentials,
  NoteEncryptionMetadata,
  UnlockCredentials,
  UserId,
} from '@/shared/contracts'
import {
  base64ToBytes,
  bytesToArrayBuffer,
  bytesToBase64,
  bytesToUtf8,
  utf8ToBytes,
} from '@/crypto/encoding'
import {
  defaultPasswordKdfParams,
  derivePasswordWrappingKey,
} from '@/crypto/password-kdf'

export type EncryptNoteResult = {
  encryptedPayload: string
  encryption: NoteEncryptionMetadata
}

export type CreateMasterKeyResult = {
  masterKey: CryptoKey
  profile: LocalCryptoProfile
}

export interface CryptoService {
  createMasterKeyProfile(input: {
    credentials: LockCredentials
    now: string
    userId: UserId
  }): Promise<CreateMasterKeyResult>
  decryptNotePayload(
    encryptedPayload: string,
    encryption: NoteEncryptionMetadata,
    masterKey: CryptoKey,
  ): Promise<string>
  encryptNotePayload(payload: string, masterKey: CryptoKey): Promise<EncryptNoteResult>
  unlockMasterKey(
    profile: LocalCryptoProfile,
    credentials: UnlockCredentials,
  ): Promise<CryptoKey>
}

const aesGcmAlgorithm = {
  name: 'AES-GCM',
  length: 256,
} as const

function getSubtleCrypto(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto API is not available in this runtime.')
  }

  return globalThis.crypto.subtle
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}

async function generateAesKey(): Promise<CryptoKey> {
  return getSubtleCrypto().generateKey(aesGcmAlgorithm, true, ['encrypt', 'decrypt'])
}

async function importAesKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return getSubtleCrypto().importKey(
    'raw',
    bytesToArrayBuffer(rawKey),
    aesGcmAlgorithm,
    true,
    ['encrypt', 'decrypt'],
  )
}

async function exportAesKey(key: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await getSubtleCrypto().exportKey('raw', key))
}

async function encryptBytes({
  key,
  plaintext,
}: {
  key: CryptoKey
  plaintext: Uint8Array
}): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
  const nonce = randomBytes(12)
  const ciphertext = await getSubtleCrypto().encrypt(
    {
      name: 'AES-GCM',
      iv: bytesToArrayBuffer(nonce),
    },
    key,
    bytesToArrayBuffer(plaintext),
  )

  return {
    ciphertext: new Uint8Array(ciphertext),
    nonce,
  }
}

async function decryptBytes({
  ciphertext,
  key,
  nonce,
}: {
  ciphertext: Uint8Array
  key: CryptoKey
  nonce: Uint8Array
}): Promise<Uint8Array> {
  return new Uint8Array(
    await getSubtleCrypto().decrypt(
      {
        name: 'AES-GCM',
        iv: bytesToArrayBuffer(nonce),
      },
      key,
      bytesToArrayBuffer(ciphertext),
    ),
  )
}

export class WebCryptoService implements CryptoService {
  async createMasterKeyProfile({
    credentials,
    now,
    userId,
  }: {
    credentials: LockCredentials
    now: string
    userId: UserId
  }): Promise<CreateMasterKeyResult> {
    const masterKey = await generateAesKey()
    const wrappingSalt = randomBytes(16)
    const wrappingKey = await derivePasswordWrappingKey({
      password: credentials.masterPassword,
      params: defaultPasswordKdfParams,
      salt: wrappingSalt,
    })
    const wrappedMasterKey = await encryptBytes({
      key: wrappingKey,
      plaintext: await exportAesKey(masterKey),
    })

    return {
      masterKey,
      profile: {
        userId,
        version: 1,
        kdf: defaultPasswordKdfParams,
        salt: bytesToBase64(wrappingSalt),
        wrappedMasterKey: bytesToBase64(wrappedMasterKey.ciphertext),
        wrapNonce: bytesToBase64(wrappedMasterKey.nonce),
        updatedAt: now,
      },
    }
  }

  decryptNotePayload(
    encryptedPayload: string,
    encryption: NoteEncryptionMetadata,
    masterKey: CryptoKey,
  ): Promise<string>
  async decryptNotePayload(
    encryptedPayload: string,
    encryption: NoteEncryptionMetadata,
    masterKey: CryptoKey,
  ): Promise<string> {
    const rawDek = await decryptBytes({
      ciphertext: base64ToBytes(encryption.wrappedDek),
      key: masterKey,
      nonce: base64ToBytes(encryption.wrapNonce),
    })
    const noteDek = await importAesKey(rawDek)
    const plaintext = await decryptBytes({
      ciphertext: base64ToBytes(encryptedPayload),
      key: noteDek,
      nonce: base64ToBytes(encryption.payloadNonce),
    })

    return bytesToUtf8(plaintext)
  }

  async encryptNotePayload(
    payload: string,
    masterKey: CryptoKey,
  ): Promise<EncryptNoteResult> {
    const noteDek = await generateAesKey()
    const encryptedPayload = await encryptBytes({
      key: noteDek,
      plaintext: utf8ToBytes(payload),
    })
    const wrappedDek = await encryptBytes({
      key: masterKey,
      plaintext: await exportAesKey(noteDek),
    })

    return {
      encryptedPayload: bytesToBase64(encryptedPayload.ciphertext),
      encryption: {
        version: 1,
        algorithm: 'AES-GCM-256',
        payloadNonce: bytesToBase64(encryptedPayload.nonce),
        wrappedDek: bytesToBase64(wrappedDek.ciphertext),
        wrapNonce: bytesToBase64(wrappedDek.nonce),
      },
    }
  }

  async unlockMasterKey(
    profile: LocalCryptoProfile,
    credentials: UnlockCredentials,
  ): Promise<CryptoKey> {
    if (!credentials.masterPassword) {
      throw new Error('Master password is required to unlock the master key.')
    }

    const wrappingKey = await derivePasswordWrappingKey({
      password: credentials.masterPassword,
      params: profile.kdf,
      salt: base64ToBytes(profile.salt),
    })
    const rawMasterKey = await decryptBytes({
      ciphertext: base64ToBytes(profile.wrappedMasterKey),
      key: wrappingKey,
      nonce: base64ToBytes(profile.wrapNonce),
    })

    return importAesKey(rawMasterKey)
  }
}

export function createCryptoService(): CryptoService {
  return new WebCryptoService()
}
