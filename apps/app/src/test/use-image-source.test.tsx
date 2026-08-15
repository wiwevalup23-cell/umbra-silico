import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { imageIdSchema, type ImageId } from '@/shared/contracts'
import { ImageSourceContext, useImageSource } from '@/ui/document'
import { createImageUrlCache } from '@/viewmodel/image-url-cache'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const cleanupTasks: Array<() => void> = []
const slowImage = imageIdSchema.parse('image_slow')
const otherImage = imageIdSchema.parse('image_other')

let urlsById: Map<string, string>
let revokedUrls: string[]

beforeEach(() => {
  urlsById = new Map()
  revokedUrls = []
})

afterEach(() => {
  while (cleanupTasks.length > 0) {
    cleanupTasks.pop()?.()
  }
  vi.restoreAllMocks()
})

function blob(): Blob {
  return new Blob([new Uint8Array(8)], { type: 'image/webp' })
}

/**
 * The real cache, not a stand-in.
 *
 * What is being pinned is a mismatch between when the hook gives a reference
 * back and when the cache has one to take — a mock that counted calls would
 * report success either way. `maxEntries: 1` makes the consequence visible:
 * asking for a second image can only evict the first if the first is idle.
 */
function createCache(controlSlowImage: boolean) {
  const settlers = new Map<string, (value: Blob) => void>()
  let counter = 0

  URL.createObjectURL = vi.fn(() => `blob:hook-test-${(counter += 1)}`)
  URL.revokeObjectURL = vi.fn((url: string) => {
    revokedUrls.push(url)
  })

  const cache = createImageUrlCache(
    async (id) => {
      const created = await (controlSlowImage && id === slowImage
        ? new Promise<Blob>((resolve) => settlers.set(id, resolve))
        : Promise.resolve(blob()))

      return created
    },
    { maxEntries: 1, maxTotalBytes: 4096 },
  )

  return {
    cache,
    settle(id: ImageId) {
      settlers.get(id)?.(blob())
    },
    rememberUrl(id: string, url: string) {
      urlsById.set(id, url)
    },
  }
}

function Thumb({ id }: { id: ImageId | null }) {
  const state = useImageSource(id, 'thumb')

  if (state.status === 'ready') {
    urlsById.set(String(id), state.url)
  }

  return <output>{state.status}</output>
}

function mount() {
  const container = document.createElement('div')

  document.body.append(container)

  const root = createRoot(container)

  cleanupTasks.push(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  return { container, root }
}

describe('resolving an image for as long as a component is mounted', () => {
  it('gives the reference back when it unmounts before the image arrives', async () => {
    const { cache, settle } = createCache(true)
    const { root } = mount()

    act(() => {
      root.render(
        <ImageSourceContext.Provider value={cache}>
          <Thumb id={slowImage} />
        </ImageSourceContext.Provider>,
      )
    })

    // Scrolling a long gallery past a thumbnail, or switching notes, unmounts
    // a view whose image is still being read.
    act(() => {
      root.render(
        <ImageSourceContext.Provider value={cache}>{null}</ImageSourceContext.Provider>,
      )
    })

    await act(async () => {
      settle(slowImage)
      await Promise.resolve()
      await Promise.resolve()
    })

    // Releasing while the request was in flight found nothing to decrement,
    // and the resolve that followed set the count to one for a view already
    // gone. The cache only evicts at zero, so that URL stayed pinned — and
    // once enough of them had, eviction stopped working at all.
    await act(async () => {
      await cache.request(otherImage, 'thumb')
    })

    expect(revokedUrls).toHaveLength(1)
  })

  it('holds the reference for as long as it is mounted', async () => {
    const { cache } = createCache(false)
    const { container, root } = mount()

    await act(async () => {
      root.render(
        <ImageSourceContext.Provider value={cache}>
          <Thumb id={slowImage} />
        </ImageSourceContext.Provider>,
      )
    })

    expect(container.textContent).toBe('ready')

    // The URL on screen must survive another image arriving and pushing the
    // cache over its limit.
    await act(async () => {
      await cache.request(otherImage, 'thumb')
    })

    expect(revokedUrls).not.toContain(urlsById.get(slowImage))
    expect(container.textContent).toBe('ready')
  })

  it('reports an image it cannot read, and gives back nothing it never took', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:never')
    URL.revokeObjectURL = vi.fn((url: string) => {
      revokedUrls.push(url)
    })

    const cache = createImageUrlCache(async () => null)
    const { container, root } = mount()

    await act(async () => {
      root.render(
        <ImageSourceContext.Provider value={cache}>
          <Thumb id={slowImage} />
        </ImageSourceContext.Provider>,
      )
    })

    expect(container.textContent).toBe('error')

    await act(async () => {
      root.render(
        <ImageSourceContext.Provider value={cache}>{null}</ImageSourceContext.Provider>,
      )
    })

    expect(revokedUrls).toEqual([])
  })

  it('reports an error when there is no resolver to ask', async () => {
    const { container, root } = mount()

    await act(async () => {
      root.render(<Thumb id={slowImage} />)
    })

    expect(container.textContent).toBe('error')
  })
})
