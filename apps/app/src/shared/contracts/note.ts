import { z } from 'zod'
import {
  noteEncryptionMetadataSchema,
  type NoteEncryptionMetadata,
} from '@/shared/contracts/crypto'
import {
  emptyDocumentV1,
  noteDocumentSchema,
  type NoteDocument,
} from '@/shared/contracts/document'
import { folderIdSchema } from '@/shared/contracts/folder'

export const noteIdSchema = z.string().min(1).brand<'NoteId'>()
export const userIdSchema = z.string().min(1).brand<'UserId'>()
export const deviceIdSchema = z.string().min(1).brand<'DeviceId'>()
export const operationIdSchema = z.string().min(1).brand<'OperationId'>()

export const isoDateTimeSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'Expected an ISO-compatible date time string.',
})

export type NoteId = z.infer<typeof noteIdSchema>
export type UserId = z.infer<typeof userIdSchema>
export type DeviceId = z.infer<typeof deviceIdSchema>
export type OperationId = z.infer<typeof operationIdSchema>
export type IsoDateTime = z.infer<typeof isoDateTimeSchema>

export const noteSyncStatusValues = [
  'synced',
  'dirty',
  'syncing',
  'conflict',
  'error',
] as const

export const noteSyncStatusSchema = z.enum(noteSyncStatusValues)
export type NoteSyncStatus = z.infer<typeof noteSyncStatusSchema>

export const notePropertyStatusValues = ['none', 'idea', 'active', 'done'] as const
export const notePropertyStatusSchema = z.enum(notePropertyStatusValues)
export type NotePropertyStatus = z.infer<typeof notePropertyStatusSchema>

export const noteTagSchema = z.string().trim().min(1).max(32)
export const notePropertiesSchema = z.object({
  status: notePropertyStatusSchema.default('none'),
  tags: z.array(noteTagSchema).max(12).transform(normalizeNoteTags).default([]),
})

export type NoteProperties = z.infer<typeof notePropertiesSchema>

export const emptyNoteProperties: NoteProperties = {
  status: 'none',
  tags: [],
}

export function normalizeNoteTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const value of tags) {
    const tag = value.trim().replace(/^#+/, '').replace(/\s+/g, ' ')
    const key = tag.toLocaleLowerCase()

    if (!tag || tag.length > 32 || seen.has(key)) {
      continue
    }

    seen.add(key)
    normalized.push(tag)

    if (normalized.length === 12) {
      break
    }
  }

  return normalized
}

export const noteListItemSchema = z.object({
  id: noteIdSchema,
  title: z.string(),
  preview: z.string(),
  isLocked: z.boolean(),
  parentFolderId: folderIdSchema.nullable(),
  updatedAt: isoDateTimeSchema,
  syncStatus: noteSyncStatusSchema,
  propertyStatus: notePropertyStatusSchema.optional(),
  tags: z.array(noteTagSchema).optional(),
})

export type NoteListItem = z.infer<typeof noteListItemSchema>

const localNoteBaseSchema = z.object({
  id: noteIdSchema,
  userId: userIdSchema,
  schemaVersion: z.literal(1),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  deletedAt: isoDateTimeSchema.nullable(),
  parentFolderId: folderIdSchema.nullable().default(null),
  localRevision: z.number().int().nonnegative(),
  remoteRevision: z.number().int().nonnegative().nullable(),
  baseRemoteRevision: z.number().int().nonnegative().nullable(),
  syncStatus: noteSyncStatusSchema,
  lastOpId: operationIdSchema.nullable(),
  deviceId: deviceIdSchema,
})

export const plaintextLocalNoteSchema = localNoteBaseSchema.extend({
  isLocked: z.literal(false),
  title: z.string().min(1),
  preview: z.string(),
  document: noteDocumentSchema,
  properties: notePropertiesSchema.optional(),
  encryptedPayload: z.null(),
  encryption: z.null(),
})

export const encryptedLocalNoteSchema = localNoteBaseSchema.extend({
  isLocked: z.literal(true),
  title: z.null(),
  preview: z.null(),
  document: z.null(),
  encryptedPayload: z.string().min(1),
  encryption: noteEncryptionMetadataSchema,
})

export const localNoteSchema = z.discriminatedUnion('isLocked', [
  plaintextLocalNoteSchema,
  encryptedLocalNoteSchema,
])

export type PlaintextLocalNote = z.infer<typeof plaintextLocalNoteSchema>
export type EncryptedLocalNote = z.infer<typeof encryptedLocalNoteSchema>
export type LocalNote = PlaintextLocalNote | EncryptedLocalNote
export type NoteDetail = LocalNote

export const createNoteInputSchema = z.object({
  title: z.string().min(1).optional(),
  document: noteDocumentSchema.optional(),
  parentFolderId: folderIdSchema.nullable().optional(),
  properties: notePropertiesSchema.optional(),
})

export type CreateNoteInput = z.infer<typeof createNoteInputSchema>

export const updateNotePatchSchema = z
  .object({
    title: z.string().min(1).optional(),
    document: noteDocumentSchema.optional(),
    parentFolderId: folderIdSchema.nullable().optional(),
    properties: notePropertiesSchema.optional(),
  })
  .refine(
    (patch) =>
      patch.title !== undefined ||
      patch.document !== undefined ||
      patch.parentFolderId !== undefined ||
      patch.properties !== undefined,
    {
      message: 'Update patch must include at least one changed field.',
    },
  )

export type UpdateNotePatch = z.infer<typeof updateNotePatchSchema>

export const noteListQuerySchema = z.object({
  folderId: folderIdSchema.nullable().optional(),
  includeDeleted: z.boolean().optional(),
  search: z.string().optional(),
})

export type NoteListQuery = z.infer<typeof noteListQuerySchema>

export function parseLocalNote(value: unknown): LocalNote {
  return localNoteSchema.parse(value)
}

export function isLocalNote(value: unknown): value is LocalNote {
  return localNoteSchema.safeParse(value).success
}

export function createDraftLocalNote(input: {
  id: NoteId
  userId: UserId
  deviceId: DeviceId
  now: IsoDateTime
  title?: string
  document?: NoteDocument
  parentFolderId?: z.infer<typeof folderIdSchema> | null
  properties?: NoteProperties
}): PlaintextLocalNote {
  return {
    id: input.id,
    userId: input.userId,
    schemaVersion: 1,
    title: input.title ?? 'Untitled',
    preview: '',
    isLocked: false,
    document: input.document ?? emptyDocumentV1,
    properties: notePropertiesSchema.parse(input.properties ?? emptyNoteProperties),
    encryptedPayload: null,
    encryption: null,
    createdAt: input.now,
    updatedAt: input.now,
    deletedAt: null,
    parentFolderId: input.parentFolderId ?? null,
    localRevision: 0,
    remoteRevision: null,
    baseRemoteRevision: null,
    syncStatus: 'dirty',
    lastOpId: null,
    deviceId: input.deviceId,
  }
}

export function toLockedListItem(note: EncryptedLocalNote): NoteListItem {
  return {
    id: note.id,
    title: 'Locked note',
    preview: '',
    isLocked: true,
    parentFolderId: note.parentFolderId,
    updatedAt: note.updatedAt,
    syncStatus: note.syncStatus,
  }
}

export function toPlaintextListItem(note: PlaintextLocalNote): NoteListItem {
  return {
    id: note.id,
    title: note.title,
    preview: note.preview,
    isLocked: false,
    parentFolderId: note.parentFolderId,
    updatedAt: note.updatedAt,
    syncStatus: note.syncStatus,
    propertyStatus: note.properties?.status,
    tags: note.properties?.tags,
  }
}

export type NoteEncryptionFields = {
  encryptedPayload: string
  encryption: NoteEncryptionMetadata
}
