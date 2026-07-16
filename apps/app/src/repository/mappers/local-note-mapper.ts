import {
  jsonObjectSchema,
  parseJsonValue,
  type JsonObject,
  type LocalNote,
} from '@/shared/contracts'

export type NoteSnapshotPayload = JsonObject & {
  kind: 'note.snapshot'
}

export function mapLocalNoteToSyncPayload(note: LocalNote): NoteSnapshotPayload {
  return jsonObjectSchema.parse({
    kind: 'note.snapshot',
    note: parseJsonValue(note),
  }) as NoteSnapshotPayload
}
