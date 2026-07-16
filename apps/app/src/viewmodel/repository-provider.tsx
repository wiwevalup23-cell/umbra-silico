import type { PropsWithChildren } from 'react'
import type { NoteRepository } from '@/repository/contracts'
import { RepositoryContext } from '@/viewmodel/repository-context'

export type RepositoryProviderProps = PropsWithChildren<{
  repository: NoteRepository
}>

export function RepositoryProvider({
  children,
  repository,
}: RepositoryProviderProps) {
  return (
    <RepositoryContext.Provider value={repository}>
      {children}
    </RepositoryContext.Provider>
  )
}
