import { createContext } from 'react'
import type { ImageSourceResolver } from '@/shared/contracts'

// UI-owned context so TipTap node views (rendered via portals inside
// EditorContent) can reach the resolver the app layer injected as a prop.
export const ImageSourceContext = createContext<ImageSourceResolver | null>(null)
