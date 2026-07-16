import { useContext } from 'react'
import type { NoteRepository } from '@/repository/contracts'
import { RepositoryContext } from '@/viewmodel/repository-context'

export function useNoteRepository(): NoteRepository {
  const repository = useContext(RepositoryContext)

  if (!repository) {
    throw new Error('NoteRepository is missing from RepositoryProvider.')
  }

  return repository
}
