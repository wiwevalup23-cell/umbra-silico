import { z } from 'zod'
import { isoDateTimeSchema, noteIdSchema } from '@/shared/contracts/note'
import { syncOperationTypeSchema } from '@/shared/contracts/sync'

/**
 * One retained point in a note's history.
 *
 * Versions are read back out of the outbox operations the repository already
 * writes for sync: every operation carries a full note snapshot, so the log
 * doubles as an edit history without a second write path.
 */
export const noteVersionSchema = z.object({
  opId: z.string().min(1),
  noteId: noteIdSchema,
  createdAt: isoDateTimeSchema,
  changeType: syncOperationTypeSchema,
  /** Null when the snapshot was taken while the note was locked. */
  title: z.string().nullable(),
  preview: z.string().nullable(),
  isLocked: z.boolean(),
  /** The snapshot matching the note as it stands right now. */
  isCurrent: z.boolean(),
})

export type NoteVersion = z.infer<typeof noteVersionSchema>
