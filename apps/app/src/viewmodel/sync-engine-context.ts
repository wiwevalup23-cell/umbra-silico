import { createContext } from 'react'
import type { SyncEngine } from '@/sync'

export const SyncEngineContext = createContext<SyncEngine | null>(null)
