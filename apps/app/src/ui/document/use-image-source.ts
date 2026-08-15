import { useContext, useEffect, useState } from 'react'
import type { ImageId, ImageTier } from '@/shared/contracts'
import { ImageSourceContext } from './image-source-context'

export type ImageSourceState =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'error' }

/**
 * Resolves an image to an object URL for as long as the component is mounted.
 *
 * Three components used to carry their own copy of this — the editor's image
 * block, the chat feed, the note gallery — and all three leaked the same way,
 * which is the argument for there being one.
 *
 * The resolver hands out ref-counted URLs, so every request has to be paired
 * with exactly one release. The pairing is the whole difficulty: a component
 * can unmount while its request is still in flight, and releasing then finds
 * nothing to decrement — the entry does not exist yet. The request lands a
 * moment later and sets the count to one on behalf of a view that is already
 * gone, and the cache only ever evicts at zero, so that URL is pinned for the
 * rest of the session. Enough of them and eviction stops entirely.
 *
 * So the release waits for the acquire it belongs to. A request that failed
 * never took a reference and needs no release.
 */
export function useImageSource(
  imageId: ImageId | null,
  tier: ImageTier,
): ImageSourceState {
  const resolver = useContext(ImageSourceContext)
  const [state, setState] = useState<ImageSourceState>({ status: 'loading' })

  useEffect(() => {
    if (!imageId || !resolver) {
      setState({ status: 'error' })
      return
    }

    let alive = true
    setState({ status: 'loading' })

    const acquired = resolver.request(imageId, tier)

    acquired.then(
      (url) => {
        if (alive) {
          setState({ status: 'ready', url })
        }
      },
      () => {
        if (alive) {
          setState({ status: 'error' })
        }
      },
    )

    return () => {
      alive = false
      acquired.then(
        () => resolver.release(imageId, tier),
        // Nothing was acquired, so there is nothing to give back.
        () => undefined,
      )
    }
  }, [imageId, resolver, tier])

  return state
}
