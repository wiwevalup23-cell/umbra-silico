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

export type NoteOpSummary = {
  opId: string
  createdAt: string
}

export interface LocalNotesStore {
  /** Whole notes including deleted ones; used for backups, not for lists. */
  listAllNotes(): Promise<LocalNote[]>
  listNotes(): Promise<NoteListItem[]>
  listDeletedNotes(): Promise<NoteListItem[]>
  /**
   * Ids of live notes whose title, body or tags contain `term`. Searching in
   * the store keeps note bodies out of the list path: only this call reads
   * them, and only while the user is actually searching.
   */
  searchNoteIds(term: string): Promise<NoteId[]>
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
  /** Every retained operation for a note, newest first. */
  listNoteOps(noteId: NoteId): Promise<SyncOperation[]>
  /**
   * Just the identity and age of a note's operations, newest first. Retention
   * only needs those two fields, and deserializing every full snapshot to get
   * them costs hundreds of milliseconds on a large chat.
   */
  listNoteOpSummaries(noteId: NoteId): Promise<NoteOpSummary[]>
  deleteOps(opIds: readonly string[]): Promise<void>
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
