import { createContext } from 'react'
import type { ImageRepository } from '@/repository/contracts'
import type { ImageSourceResolver } from '@/shared/contracts'

// Nullable on purpose: the workspace stays functional (minus images) when the
// images module is not wired up, and older tests render the provider without it.
export const ImageRepositoryContext = createContext<ImageRepository | null>(null)

export const ImageSourceResolverContext = createContext<ImageSourceResolver | null>(null)
