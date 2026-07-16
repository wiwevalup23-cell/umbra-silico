export function createClientId(prefix: string): string {
  return `${prefix}_${globalThis.crypto.randomUUID()}`
}
