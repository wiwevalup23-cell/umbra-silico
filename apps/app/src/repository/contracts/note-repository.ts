import type { LiveQuery } from '@/repository/contracts/live-query'
import type {
  ConflictRecord,
  CreateNoteInput,
  FolderId,
  FolderTreeNode,
  LocalCryptoProfile,
  LocalFolder,
  LockCredentials,
  NoteDetail,
  NoteId,
  NoteListItem,
  NoteListQuery,
  NoteVersion,
  RemoteNoteChange,
  SyncOperation,
  UnlockCredentials,
  UnlockedNoteSession,
  UpdateNotePatch,
} from '@/shared/contracts'

/**
 * `recoveryKey` is non-null only on the lock that created the vault, which is
 * the single moment the key can be shown: it is never stored in clear.
 */
export type LockNoteResult = {
  recoveryKey: string | null
}

/** Raw library contents, for building and restoring a backup bundle. */
export type NoteBackupData = {
  cryptoProfile: LocalCryptoProfile | null
  folders: LocalFolder[]
  notes: NoteDetail[]
}

export type NoteBackupRestoreReport = {
  cryptoProfileRestored: boolean
  foldersAdded: number
  foldersSkipped: number
  notesAdded: number
  notesSkipped: number
}

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

  lockNote(noteId: NoteId, credentials: LockCredentials): Promise<LockNoteResult>
  unlockNoteForSession(
    noteId: NoteId,
    credentials: UnlockCredentials,
  ): Promise<UnlockedNoteSession>

  readBackupData(): Promise<NoteBackupData>
  /** Adds what is missing and never overwrites or deletes existing notes. */
  restoreBackupData(data: NoteBackupData): Promise<NoteBackupRestoreReport>

  listNoteVersions(noteId: NoteId): Promise<NoteVersion[]>
  restoreNoteVersion(noteId: NoteId, opId: string): Promise<void>

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
