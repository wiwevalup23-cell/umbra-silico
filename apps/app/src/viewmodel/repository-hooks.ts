import { useContext } from 'react'
import type { ImageRepository, NoteRepository } from '@/repository/contracts'
import type { ImageSourceResolver } from '@/shared/contracts'
import {
  ImageRepositoryContext,
  ImageSourceResolverContext,
} from '@/viewmodel/image-repository-context'
import { RepositoryContext } from '@/viewmodel/repository-context'

export function useNoteRepository(): NoteRepository {
  const repository = useContext(RepositoryContext)

  if (!repository) {
    throw new Error('NoteRepository is missing from RepositoryProvider.')
  }

  return repository
}

// Nullable variants: images degrade gracefully when the module is not wired.
export function useImageRepository(): ImageRepository | null {
  return useContext(ImageRepositoryContext)
}

export function useImageSourceResolver(): ImageSourceResolver | null {
  return useContext(ImageSourceResolverContext)
}
