import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { imageIdSchema, type ImageId } from '@/shared/contracts'
import { createImageUrlCache } from '@/viewmodel/image-url-cache'

const idA = imageIdSchema.parse('image_a')
const idB = imageIdSchema.parse('image_b')
const idC = imageIdSchema.parse('image_c')
const idD = imageIdSchema.parse('image_d')

function makeBlob(size = 8): Blob {
  return new Blob([new Uint8Array(size)], { type: 'image/webp' })
}

describe('image url cache', () => {
  let createdUrls: string[]
  let revokedUrls: string[]

  beforeEach(() => {
    createdUrls = []
    revokedUrls = []
    let counter = 0

    URL.createObjectURL = vi.fn(() => {
      const url = `blob:cache-test-${counter}`
      counter += 1
      createdUrls.push(url)
      return url
    })
    URL.revokeObjectURL = vi.fn((url: string) => {
      revokedUrls.push(url)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('serves repeat requests from cache and dedupes in-flight loads', async () => {
    const getBlob = vi.fn(async () => makeBlob())
    const cache = createImageUrlCache(getBlob)

    const [first, second] = await Promise.all([
      cache.request(idA, 'display'),
      cache.request(idA, 'display'),
    ])
    const third = await cache.request(idA, 'display')

    expect(first).toBe(second)
    expect(second).toBe(third)
    expect(getBlob).toHaveBeenCalledTimes(1)
  })

  it('rejects when the blob is unavailable and retries on the next request', async () => {
    const getBlob = vi
      .fn<(id: ImageId, tier: string) => Promise<Blob | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeBlob())
    const cache = createImageUrlCache(getBlob)

    await expect(cache.request(idA, 'thumb')).rejects.toThrow('unavailable')
    await expect(cache.request(idA, 'thumb')).resolves.toMatch(/^blob:/)
  })

  it('evicts only zero-ref entries, oldest first', async () => {
    const cache = createImageUrlCache(async () => makeBlob(), { maxEntries: 2 })

    const urlA = await cache.request(idA, 'thumb')
    const urlB = await cache.request(idB, 'thumb')

    // Both still referenced: adding a third entry must not revoke anything.
    await cache.request(idC, 'thumb')
    expect(revokedUrls).toEqual([])

    // Releasing A makes it the oldest zero-ref entry; the next insert evicts it.
    cache.release(idA, 'thumb')
    await cache.request(idD, 'thumb')
    expect(revokedUrls).toEqual([urlA])
    expect(revokedUrls).not.toContain(urlB)
  })

  it('returns below the limit as soon as an over-limit entry is released', async () => {
    const cache = createImageUrlCache(async () => makeBlob(), { maxEntries: 2 })

    const urlA = await cache.request(idA, 'thumb')
    await cache.request(idB, 'thumb')
    await cache.request(idC, 'thumb')
    expect(revokedUrls).toEqual([])

    cache.release(idA, 'thumb')

    expect(revokedUrls).toEqual([urlA])
  })

  it('clear revokes every cached url', async () => {
    const cache = createImageUrlCache(async () => makeBlob())

    await cache.request(idA, 'display')
    await cache.request(idB, 'thumb')
    cache.clear()

    expect(new Set(revokedUrls)).toEqual(new Set(createdUrls))
  })
})
