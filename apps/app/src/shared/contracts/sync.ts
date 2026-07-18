import { z } from 'zod'
import { jsonValueSchema } from '@/shared/contracts/json'
import {
  deviceIdSchema,
  isoDateTimeSchema,
  noteIdSchema,
  operationIdSchema,
  userIdSchema,
} from '@/shared/contracts/note'

export const syncOperationTypeValues = [
  'note.create',
  'note.update',
  'note.delete',
  'note.lock',
  'note.unlock',
  'folder.create',
  'folder.update',
  'folder.delete',
  // Reserved for the future sync module; never enqueued by the local-only
  // build. Image rows carry sync_status/deleted_at tombstones from which the
  // sync module can derive these operations later.
  'image.create',
  'image.delete',
] as const

export const syncOperationTypeSchema = z.enum(syncOperationTypeValues)
export type SyncOperationType = z.infer<typeof syncOperationTypeSchema>

export const syncOperationStatusValues = [
  'pending',
  'syncing',
  'synced',
  'failed',
] as const

export const syncOperationStatusSchema = z.enum(syncOperationStatusValues)
export type SyncOperationStatus = z.infer<typeof syncOperationStatusSchema>

export const syncOperationSchema = z.object({
  opId: operationIdSchema,
  noteId: noteIdSchema,
  userId: userIdSchema,
  deviceId: deviceIdSchema,
  type: syncOperationTypeSchema,
  payload: jsonValueSchema,
  baseRemoteRevision: z.number().int().nonnegative().nullable(),
  createdAt: isoDateTimeSchema,
  attemptCount: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  status: syncOperationStatusSchema,
})

export type SyncOperation = z.infer<typeof syncOperationSchema>

export const remoteNoteChangeSchema = z.object({
  noteId: noteIdSchema,
  serverRevision: z.number().int().positive(),
  changedByDeviceId: deviceIdSchema.nullable(),
  payload: jsonValueSchema,
})

export type RemoteNoteChange = z.infer<typeof remoteNoteChangeSchema>

export const syncReasonValues = [
  'startup',
  'manual',
  'network-online',
  'outbox-change',
] as const

export const syncReasonSchema = z.enum(syncReasonValues)
export type SyncReason = z.infer<typeof syncReasonSchema>

export const syncStatusValues = [
  'offline',
  'idle',
  'syncing',
  'conflict',
  'error',
] as const

export const syncStatusSnapshotSchema = z.object({
  status: z.enum(syncStatusValues),
  pendingOperations: z.number().int().nonnegative(),
  lastSyncedAt: isoDateTimeSchema.nullable(),
  lastError: z.string().nullable(),
})

export type SyncStatusSnapshot = z.infer<typeof syncStatusSnapshotSchema>

export const conflictRecordSchema = z.object({
  noteId: noteIdSchema,
  localRevision: z.number().int().nonnegative(),
  remoteRevision: z.number().int().nonnegative(),
  detectedAt: isoDateTimeSchema,
})

export type ConflictRecord = z.infer<typeof conflictRecordSchema>

export function parseSyncOperation(value: unknown): SyncOperation {
  return syncOperationSchema.parse(value)
}

export function isSyncOperation(value: unknown): value is SyncOperation {
  return syncOperationSchema.safeParse(value).success
}
