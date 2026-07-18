import { z } from 'zod'
import { noteEncryptionMetadataSchema } from '@/shared/contracts/crypto'
import type { DocumentNode, NoteDocument, TextNode } from '@/shared/contracts/document'
import {
  deviceIdSchema,
  isoDateTimeSchema,
  noteIdSchema,
  noteSyncStatusSchema,
  userIdSchema,
} from '@/shared/contracts/note'

export const imageIdSchema = z.string().min(1).brand<'ImageId'>()
export type ImageId = z.infer<typeof imageIdSchema>

// Renditions keep the editor light: `original` is stored lossless but never
// decoded for routine rendering, `display` is what the editor shows, `thumb`
// feeds the per-note gallery and other small previews.
export const imageTierValues = ['original', 'display', 'thumb'] as const
export const imageTierSchema = z.enum(imageTierValues)
export type ImageTier = z.infer<typeof imageTierSchema>

export const imageRenditionInfoSchema = z.object({
  mimeType: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})
export type ImageRenditionInfo = z.infer<typeof imageRenditionInfoSchema>

export const localImageMetaSchema = z.object({
  id: imageIdSchema,
  noteId: noteIdSchema,
  userId: userIdSchema,
  sourceFileName: z.string().nullable(),
  mimeType: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  renditions: z.partialRecord(imageTierSchema, imageRenditionInfoSchema),
  isEncrypted: z.boolean(),
  encryption: z.partialRecord(imageTierSchema, noteEncryptionMetadataSchema).nullable(),
  createdAt: isoDateTimeSchema,
  deletedAt: isoDateTimeSchema.nullable(),
  localRevision: z.number().int().nonnegative(),
  syncStatus: noteSyncStatusSchema,
  deviceId: deviceIdSchema,
})
export type LocalImageMeta = z.infer<typeof localImageMetaSchema>

export type NoteImageListItem = Pick<
  LocalImageMeta,
  'id' | 'noteId' | 'width' | 'height' | 'createdAt' | 'isEncrypted' | 'mimeType'
>

export function toNoteImageListItem(meta: LocalImageMeta): NoteImageListItem {
  return {
    id: meta.id,
    noteId: meta.noteId,
    width: meta.width,
    height: meta.height,
    createdAt: meta.createdAt,
    isEncrypted: meta.isEncrypted,
    mimeType: meta.mimeType,
  }
}

export function parseLocalImageMeta(value: unknown): LocalImageMeta {
  return localImageMetaSchema.parse(value)
}

// Contract only: the implementation lives in the viewmodel layer so dumb UI
// components can consume object URLs without touching the repository.
export type ImageSourceResolver = {
  request(imageId: ImageId, tier: ImageTier): Promise<string>
  release(imageId: ImageId, tier: ImageTier): void
}

export const imageBlockNodeName = 'imageBlock'

export function collectImageIdsFromDocument(document: NoteDocument): ImageId[] {
  const found = new Set<ImageId>()
  collectFromNode(document.content, found)
  return [...found]
}

function collectFromNode(node: DocumentNode | TextNode, found: Set<ImageId>): void {
  if (node.type === imageBlockNodeName) {
    const attrs = (node as DocumentNode).attrs
    const parsed = imageIdSchema.safeParse(attrs?.imageId)
    if (parsed.success) {
      found.add(parsed.data)
    }
  }

  const content = (node as DocumentNode).content
  if (Array.isArray(content)) {
    for (const child of content) {
      collectFromNode(child, found)
    }
  }
}
