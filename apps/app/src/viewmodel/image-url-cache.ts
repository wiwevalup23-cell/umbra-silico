import type { ImageId, ImageSourceResolver, ImageTier } from '@/shared/contracts'

export type ImageUrlCache = ImageSourceResolver & {
  clear(): void
}

export type ImageUrlCacheOptions = {
  maxEntries?: number
  maxTotalBytes?: number
}

type CacheEntry = {
  url: string
  bytes: number
  refCount: number
  lastUsedAt: number
}

const defaultMaxEntries = 64
const defaultMaxTotalBytes = 192 * 1024 * 1024

// Ref-counted object-URL cache shared by the editor and the gallery. Consumers
// pair every request() with a release(); zero-ref entries stay cached for
// reuse until the LRU eviction revokes them.
export function createImageUrlCache(
  getBlob: (imageId: ImageId, tier: ImageTier) => Promise<Blob | null>,
  options: ImageUrlCacheOptions = {},
): ImageUrlCache {
  const maxEntries = options.maxEntries ?? defaultMaxEntries
  const maxTotalBytes = options.maxTotalBytes ?? defaultMaxTotalBytes
  const entries = new Map<string, CacheEntry>()
  const pending = new Map<string, Promise<string>>()
  let totalBytes = 0
  let tick = 0

  function keyFor(imageId: ImageId, tier: ImageTier): string {
    return `${imageId}/${tier}`
  }

  function evictIfNeeded(): void {
    if (entries.size <= maxEntries && totalBytes <= maxTotalBytes) {
      return
    }

    const idle = [...entries.entries()]
      .filter(([, entry]) => entry.refCount === 0)
      .sort(([, left], [, right]) => left.lastUsedAt - right.lastUsedAt)

    for (const [key, entry] of idle) {
      if (entries.size <= maxEntries && totalBytes <= maxTotalBytes) {
        return
      }

      URL.revokeObjectURL(entry.url)
      totalBytes -= entry.bytes
      entries.delete(key)
    }
  }

  return {
    async request(imageId, tier) {
      const key = keyFor(imageId, tier)
      const cached = entries.get(key)

      if (cached) {
        cached.refCount += 1
        cached.lastUsedAt = ++tick
        return cached.url
      }

      const inFlight = pending.get(key)

      if (inFlight) {
        const url = await inFlight
        const entry = entries.get(key)

        if (entry) {
          entry.refCount += 1
          entry.lastUsedAt = ++tick
        }

        return url
      }

      const load = (async () => {
        const blob = await getBlob(imageId, tier)

        if (!blob) {
          throw new Error(`Image ${imageId} (${tier}) is unavailable.`)
        }

        const url = URL.createObjectURL(blob)

        entries.set(key, {
          url,
          bytes: blob.size,
          refCount: 0,
          lastUsedAt: ++tick,
        })
        totalBytes += blob.size

        return url
      })()

      pending.set(key, load)

      try {
        const url = await load
        const entry = entries.get(key)

        if (entry) {
          entry.refCount += 1
          entry.lastUsedAt = ++tick
        }

        evictIfNeeded()
        return url
      } finally {
        pending.delete(key)
      }
    },

    release(imageId, tier) {
      const entry = entries.get(keyFor(imageId, tier))

      if (!entry) {
        return
      }

      entry.refCount = Math.max(0, entry.refCount - 1)
      entry.lastUsedAt = ++tick
      evictIfNeeded()
    },

    clear() {
      for (const entry of entries.values()) {
        URL.revokeObjectURL(entry.url)
      }

      entries.clear()
      pending.clear()
      totalBytes = 0
    },
  }
}
