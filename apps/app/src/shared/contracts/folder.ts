import { z } from 'zod'

export const folderIdSchema = z.string().min(1).brand<'FolderId'>()
export type FolderId = z.infer<typeof folderIdSchema>

const isoDateTimeSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'Expected an ISO-compatible date time string.',
})

const userIdSchema = z.string().min(1).brand<'UserId'>()
const deviceIdSchema = z.string().min(1).brand<'DeviceId'>()

export const folderSyncStatusValues = [
  'synced',
  'dirty',
  'syncing',
  'conflict',
  'error',
] as const

export const folderSyncStatusSchema = z.enum(folderSyncStatusValues)
export type FolderSyncStatus = z.infer<typeof folderSyncStatusSchema>

export const localFolderSchema = z.object({
  id: folderIdSchema,
  userId: userIdSchema,
  name: z.string().min(1),
  parentFolderId: folderIdSchema.nullable(),
  sortIndex: z.number().finite(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  deletedAt: isoDateTimeSchema.nullable(),
  localRevision: z.number().int().nonnegative(),
  syncStatus: folderSyncStatusSchema,
  deviceId: deviceIdSchema,
})

export type LocalFolder = z.infer<typeof localFolderSchema>

export type FolderTreeNode = {
  children: FolderTreeNode[]
  folder: LocalFolder
  noteCount: number
}

export function wouldCreateCycle(
  folders: Array<Pick<LocalFolder, 'id' | 'parentFolderId'>>,
  childId: FolderId,
  newParentId: FolderId | null,
): boolean {
  if (!newParentId) {
    return false
  }

  if (childId === newParentId) {
    return true
  }

  const folderById = new Map(folders.map((folder) => [folder.id, folder]))
  let cursor: FolderId | null = newParentId

  while (cursor) {
    if (cursor === childId) {
      return true
    }

    cursor = folderById.get(cursor)?.parentFolderId ?? null
  }

  return false
}
