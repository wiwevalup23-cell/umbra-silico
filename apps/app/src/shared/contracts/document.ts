import { z } from 'zod'
import { jsonObjectSchema, type JsonObject } from '@/shared/contracts/json'

export type TextMark = {
  type: string
  attrs?: JsonObject
}

export type TextNode = {
  type: 'text'
  text: string
  marks?: TextMark[]
}

export type DocumentNode = {
  type: string
  attrs?: JsonObject
  content?: Array<DocumentNode | TextNode>
}

export const textMarkSchema: z.ZodType<TextMark> = z.object({
  type: z.string().min(1),
  attrs: jsonObjectSchema.optional(),
})

export const textNodeSchema: z.ZodType<TextNode> = z.object({
  type: z.literal('text'),
  text: z.string(),
  marks: z.array(textMarkSchema).optional(),
})

export const documentNodeSchema: z.ZodType<DocumentNode> = z.lazy(() =>
  z.object({
    type: z.string().min(1),
    attrs: jsonObjectSchema.optional(),
    content: z.array(z.union([textNodeSchema, documentNodeSchema])).optional(),
  }),
)

export type NoteDocumentV1 = {
  schemaVersion: 1
  editor: 'tiptap'
  content: DocumentNode
}

export const noteDocumentV1Schema: z.ZodType<NoteDocumentV1> = z.object({
  schemaVersion: z.literal(1),
  editor: z.literal('tiptap'),
  content: documentNodeSchema.refine((node) => node.type === 'doc', {
    message: 'NoteDocumentV1 content root must be a doc node.',
  }),
})

export const noteDocumentSchema = noteDocumentV1Schema

export type NoteDocument = NoteDocumentV1

export const emptyDocumentV1: NoteDocumentV1 = {
  schemaVersion: 1,
  editor: 'tiptap',
  content: {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  },
}

export function parseNoteDocument(value: unknown): NoteDocument {
  return noteDocumentSchema.parse(value)
}

export function isNoteDocument(value: unknown): value is NoteDocument {
  return noteDocumentSchema.safeParse(value).success
}
