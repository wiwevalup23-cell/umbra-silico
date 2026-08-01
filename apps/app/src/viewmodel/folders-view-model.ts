import type { FolderId, NoteId } from '@/shared/contracts'
import type { NoteRepository } from '@/repository/contracts'
import { useAppUiStore } from '@/viewmodel/app-ui-store'
import { useLiveQuery, useOwnedLiveQuery } from '@/viewmodel/live-query-view-model'
import { useNoteRepository } from '@/viewmodel/repository-hooks'
import { useSyncEngine } from '@/viewmodel/sync-engine-hooks'

export type FoldersViewModel = {
  activeFolderId: FolderId | null
  createFolder(input: { name: string; parentFolderId?: FolderId | null }): Promise<FolderId>
  deleteFolder(folderId: FolderId): Promise<void>
  folderTree: ReturnType<NoteRepository['liveFolderTree']> extends {
    getSnapshot(): infer TValue
  }
    ? TValue
    : never
  moveFolder(folderId: FolderId, parentFolderId: FolderId | null): Promise<void>
  moveNoteToFolder(noteId: NoteId, folderId: FolderId | null): Promise<void>
  renameFolder(folderId: FolderId, name: string): Promise<void>
  selectFolder(folderId: FolderId | null): void
}

export function useFoldersViewModel(): FoldersViewModel {
  const repository = useNoteRepository()
  const syncEngine = useSyncEngine()
  const activeFolderId = useAppUiStore((state) => state.activeFolderId)
  const selectFolder = useAppUiStore((state) => state.setActiveFolder)
  const liveQuery = useOwnedLiveQuery(() => repository.liveFolderTree(), [repository])
  const folderTree = useLiveQuery(liveQuery)

  return {
    activeFolderId,
    async createFolder(input) {
      return repository.createFolder(input)
    },
    async deleteFolder(folderId) {
      await repository.deleteFolder(folderId)

      if (activeFolderId === folderId) {
        selectFolder(null)
      }
    },
    folderTree,
    async moveFolder(folderId, parentFolderId) {
      await repository.moveFolder(folderId, parentFolderId)
    },
    async moveNoteToFolder(noteId, folderId) {
      await repository.moveNoteToFolder(noteId, folderId)
      syncEngine?.requestSync('outbox-change')
    },
    async renameFolder(folderId, name) {
      await repository.renameFolder(folderId, name)
    },
    selectFolder,
  }
}
