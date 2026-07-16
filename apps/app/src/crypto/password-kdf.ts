import type { PasswordKdfParams as ContractPasswordKdfParams } from '@/shared/contracts'
import { bytesToArrayBuffer, utf8ToBytes } from '@/crypto/encoding'

export type PasswordKdfParams = {
  name: 'PBKDF2'
  hash: 'SHA-256'
  iterations: number
}

export const defaultPasswordKdfParams: PasswordKdfParams = {
  name: 'PBKDF2',
  hash: 'SHA-256',
  iterations: 310000,
}

function getSubtleCrypto(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto API is not available in this runtime.')
  }

  return globalThis.crypto.subtle
}

export async function derivePasswordWrappingKey({
  password,
  params = defaultPasswordKdfParams,
  salt,
}: {
  password: string
  params?: ContractPasswordKdfParams
  salt: Uint8Array
}): Promise<CryptoKey> {
  if (params.name !== 'PBKDF2') {
    throw new Error(`${params.name} password KDF is not available in the MVP runtime.`)
  }

  const subtle = getSubtleCrypto()
  const passwordKey = await subtle.importKey(
    'raw',
    bytesToArrayBuffer(utf8ToBytes(password)),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: params.hash,
      iterations: params.iterations,
      salt: bytesToArrayBuffer(salt),
    },
    passwordKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt'],
  )
}
