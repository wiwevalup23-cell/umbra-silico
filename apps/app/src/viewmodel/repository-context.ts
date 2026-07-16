import { createContext } from 'react'
import type { NoteRepository } from '@/repository/contracts'

export const RepositoryContext = createContext<NoteRepository | null>(null)
