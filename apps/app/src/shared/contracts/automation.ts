import { z } from 'zod'
import {
  isoDateTimeSchema,
  noteIdSchema,
  userIdSchema,
} from '@/shared/contracts/note'

export const automationEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('note.created'), noteId: noteIdSchema }),
  z.object({
    type: z.literal('note.updated'),
    noteId: noteIdSchema,
    changedFields: z.array(z.string().min(1)),
  }),
  z.object({ type: z.literal('note.deleted'), noteId: noteIdSchema }),
  z.object({ type: z.literal('note.locked'), noteId: noteIdSchema }),
  z.object({ type: z.literal('note.unlocked'), noteId: noteIdSchema }),
  z.object({ type: z.literal('sync.conflict'), noteId: noteIdSchema }),
])

export type AutomationEvent = z.infer<typeof automationEventSchema>

export const automationEventIdSchema = z.string().min(1).brand<'AutomationEventId'>()
export type AutomationEventId = z.infer<typeof automationEventIdSchema>

export const automationEventRecordSchema = z.object({
  id: automationEventIdSchema,
  userId: userIdSchema,
  noteId: noteIdSchema.nullable(),
  event: automationEventSchema,
  eventType: z.string().min(1),
  createdAt: isoDateTimeSchema,
  deliveredAt: isoDateTimeSchema.nullable(),
})

export type AutomationEventRecord = z.infer<typeof automationEventRecordSchema>

export const automationUnlockGrantSchema = z.object({
  noteId: noteIdSchema,
  scope: z.literal('automation.read.plaintext'),
  issuedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
})

export type AutomationUnlockGrant = z.infer<typeof automationUnlockGrantSchema>

export type AutomationNoteReadMode = 'safe' | 'plaintext'

export type AutomationNoteReadOptions = {
  mode?: AutomationNoteReadMode
  unlockGrant?: AutomationUnlockGrant
}

export type AutomationLocalApiEndpointContract = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  path: string
  implemented: false
}

export type AutomationLocalApiContract = {
  basePath: '/v1'
  enabledByDefault: false
  endpoints: AutomationLocalApiEndpointContract[]
  transport: 'post-mvp-local-http'
}

export type AutomationHandler = (event: AutomationEvent) => void | Promise<void>

export function parseAutomationEvent(value: unknown): AutomationEvent {
  return automationEventSchema.parse(value)
}

export function parseAutomationEventRecord(value: unknown): AutomationEventRecord {
  return automationEventRecordSchema.parse(value)
}
