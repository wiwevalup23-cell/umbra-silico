import type {
  AutomationEventId,
  AutomationEventRecord,
  LocalCryptoProfile,
  LocalFolder,
  LocalNote,
  NoteId,
  NoteListItem,
  SyncOperation,
  FolderId,
} from '@/shared/contracts'

export interface LocalNotesStore {
  listNotes(): Promise<NoteListItem[]>
  listDeletedNotes(): Promise<NoteListItem[]>
  getNote(id: NoteId): Promise<LocalNote | null>
  putNote(note: LocalNote): Promise<void>
  putNoteWithOp(note: LocalNote, op: SyncOperation): Promise<void>
  putNoteWithOpReplacingNoteOps(note: LocalNote, op: SyncOperation): Promise<void>
  hardDeleteNote(id: NoteId): Promise<void>
  softDeleteNote(id: NoteId): Promise<void>
  softDeleteNoteWithOp(id: NoteId, deletedAt: string, op: SyncOperation): Promise<void>
  listFolders(): Promise<LocalFolder[]>
  putFolder(folder: LocalFolder): Promise<void>
  softDeleteFolder(id: FolderId, deletedAt: string): Promise<void>
  enqueueOp(op: SyncOperation): Promise<void>
  listPendingOps(limit: number): Promise<SyncOperation[]>
  markOpSynced(opId: string): Promise<void>
  markOpFailed(opId: string, error: string): Promise<void>
  appendAutomationEvent(event: AutomationEventRecord): Promise<void>
  listAutomationEvents(limit: number): Promise<AutomationEventRecord[]>
  markAutomationEventDelivered(
    eventId: AutomationEventId,
    deliveredAt: string,
  ): Promise<void>
  getCryptoProfile(userId: string): Promise<LocalCryptoProfile | null>
  setCryptoProfile(profile: LocalCryptoProfile): Promise<void>
  getSyncState(key: string): Promise<string | null>
  setSyncState(key: string, value: string): Promise<void>
}
