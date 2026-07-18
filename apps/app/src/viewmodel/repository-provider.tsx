import { useEffect, useMemo, type PropsWithChildren } from 'react'
import type { ImageRepository, NoteRepository } from '@/repository/contracts'
import {
  ImageRepositoryContext,
  ImageSourceResolverContext,
} from '@/viewmodel/image-repository-context'
import { createImageUrlCache } from '@/viewmodel/image-url-cache'
import { RepositoryContext } from '@/viewmodel/repository-context'

export type RepositoryProviderProps = PropsWithChildren<{
  repository: NoteRepository
  imageRepository?: ImageRepository | null
}>

export function RepositoryProvider({
  children,
  repository,
  imageRepository = null,
}: RepositoryProviderProps) {
  // One app-wide object-URL cache so the editor and the gallery share URLs.
  const resolver = useMemo(
    () =>
      imageRepository
        ? createImageUrlCache((imageId, tier) => imageRepository.getImageBlob(imageId, tier))
        : null,
    [imageRepository],
  )

  useEffect(() => () => resolver?.clear(), [resolver])

  return (
    <RepositoryContext.Provider value={repository}>
      <ImageRepositoryContext.Provider value={imageRepository}>
        <ImageSourceResolverContext.Provider value={resolver}>
          {children}
        </ImageSourceResolverContext.Provider>
      </ImageRepositoryContext.Provider>
    </RepositoryContext.Provider>
  )
}
