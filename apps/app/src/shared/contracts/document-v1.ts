import { noteDocumentV1Schema, type NoteDocumentV1 } from '@/shared/contracts/document'

export const currentDocumentSchemaVersion = 1

export type DocumentSchemaVersion = typeof currentDocumentSchemaVersion

export type DocumentMigration<TFrom, TTo> = {
  fromVersion: number
  toVersion: number
  migrate(document: TFrom): TTo
}

export const documentV1Contract = {
  version: currentDocumentSchemaVersion,
  schema: noteDocumentV1Schema,
  createEmpty(): NoteDocumentV1 {
    return {
      schemaVersion: 1,
      editor: 'tiptap',
      content: {
        type: 'doc',
        content: [{ type: 'paragraph' }],
      },
    }
  },
}
