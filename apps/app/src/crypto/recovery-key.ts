// Crockford base32 without I, L, O and U: no character pair a person can
// confuse when copying the key off a screen onto paper.
const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const groupSize = 5
// 25 bytes is 200 bits and divides evenly into 40 base32 characters, so the
// key always breaks into whole 5-character groups.
const recoveryKeyBytes = 25

const decodeTable = new Map<string, number>(
  [...alphabet].map((character, index) => [character, index]),
)

function toBase32(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let output = ''

  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8

    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }

  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31]
  }

  return output
}

/**
 * Strips formatting and folds the look-alike characters a person is most
 * likely to mistype, so a key copied by hand still unlocks.
 */
export function normalizeRecoveryKey(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/U/g, 'V')
}

export function formatRecoveryKey(value: string): string {
  const normalized = normalizeRecoveryKey(value)
  const groups: string[] = []

  for (let index = 0; index < normalized.length; index += groupSize) {
    groups.push(normalized.slice(index, index + groupSize))
  }

  return groups.join('-')
}

/** 200 bits of entropy, grouped for transcription. */
export function generateRecoveryKey(): string {
  const bytes = new Uint8Array(recoveryKeyBytes)
  globalThis.crypto.getRandomValues(bytes)

  return formatRecoveryKey(toBase32(bytes))
}

export function isPlausibleRecoveryKey(value: string): boolean {
  const normalized = normalizeRecoveryKey(value)

  return (
    normalized.length === Math.ceil((recoveryKeyBytes * 8) / 5) &&
    [...normalized].every((character) => decodeTable.has(character))
  )
}
