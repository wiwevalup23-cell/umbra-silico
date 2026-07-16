import type { LiveQuery } from '@/repository/contracts/live-query'
import type {
  ConflictRecord,
  CreateNoteInput,
  FolderId,
  FolderTreeNode,
  LockCredentials,
  NoteDetail,
  NoteId,
  NoteListItem,
  NoteListQuery,
  RemoteNoteChange,
  SyncOperation,
  UnlockCredentials,
  UnlockedNoteSession,
  UpdateNotePatch,
} from '@/shared/contracts'

export interface NoteRepository {
  liveNoteList(query?: NoteListQuery): LiveQuery<NoteListItem[]>
  liveTrashList(): LiveQuery<NoteListItem[]>
  liveFolderTree(): LiveQuery<FolderTreeNode[]>
  liveNote(noteId: NoteId): LiveQuery<NoteDetail | null>
  getNote(noteId: NoteId): Promise<NoteDetail | null>

  createNote(input: CreateNoteInput): Promise<NoteId>
  createFolder(input: { name: string; parentFolderId?: FolderId | null }): Promise<FolderId>
  deleteFolder(folderId: FolderId): Promise<void>
  moveFolder(folderId: FolderId, parentFolderId: FolderId | null): Promise<void>
  moveNoteToFolder(noteId: NoteId, folderId: FolderId | null): Promise<void>
  renameFolder(folderId: FolderId, name: string): Promise<void>
  updateNote(noteId: NoteId, patch: UpdateNotePatch): Promise<void>
  deleteNote(noteId: NoteId): Promise<void>
  purgeNote(noteId: NoteId): Promise<void>
  restoreNote(noteId: NoteId): Promise<void>

  lockNote(noteId: NoteId, credentials: LockCredentials): Promise<void>
  unlockNoteForSession(
    noteId: NoteId,
    credentials: UnlockCredentials,
  ): Promise<UnlockedNoteSession>

  getPendingOps(limit: number): Promise<SyncOperation[]>
  getLastServerRevision(): Promise<number>
  markOpSynced(opId: string, remoteRevision: number): Promise<void>
  markOpFailed(opId: string, error: string): Promise<void>
  setLastServerRevision(remoteRevision: number): Promise<void>

  applyRemoteChange(change: RemoteNoteChange): Promise<void>
  markConflict(
    noteId: NoteId,
    conflict: ConflictRecord,
    remoteChange?: RemoteNoteChange,
  ): Promise<void>
}
