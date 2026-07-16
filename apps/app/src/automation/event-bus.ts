import type { LocalNotesStore } from '@/local-store/contracts'
import {
  automationEventIdSchema,
  parseAutomationEvent,
  type AutomationEvent,
  type AutomationEventRecord,
  type AutomationHandler,
  type UserId,
} from '@/shared/contracts'

export type AutomationEventBus = {
  emit(event: AutomationEvent): Promise<AutomationEventRecord | null>
  listEvents(limit: number): Promise<AutomationEventRecord[]>
  markDelivered(eventId: AutomationEventRecord['id'], deliveredAt?: string): Promise<void>
  registerHandler(handler: AutomationHandler): () => void
}

export type AutomationEventBusDependencies = {
  clock?: () => string
  idFactory?: () => string
  localStore?: Pick<
    LocalNotesStore,
    'appendAutomationEvent' | 'listAutomationEvents' | 'markAutomationEventDelivered'
  >
  userId?: UserId
}

const defaultClock = () => new Date().toISOString()

function getNoteId(event: AutomationEvent) {
  return 'noteId' in event ? event.noteId : null
}

export function createAutomationEventBus(
  dependencies: AutomationEventBusDependencies = {},
): AutomationEventBus {
  const handlers = new Set<AutomationHandler>()
  const clock = dependencies.clock ?? defaultClock
  const idFactory =
    dependencies.idFactory ??
    (() => `automation_event_${globalThis.crypto.randomUUID()}`)

  return {
    async emit(event: AutomationEvent) {
      const parsedEvent = parseAutomationEvent(event)
      const record = {
        id: automationEventIdSchema.parse(idFactory()),
        userId: dependencies.userId,
        noteId: getNoteId(parsedEvent),
        event: parsedEvent,
        eventType: parsedEvent.type,
        createdAt: clock(),
        deliveredAt: null,
      }

      if (!dependencies.localStore || !record.userId) {
        await Promise.all([...handlers].map((handler) => handler(parsedEvent)))
        return null
      }

      const persistedRecord = record as AutomationEventRecord
      await dependencies.localStore?.appendAutomationEvent(persistedRecord)
      await Promise.all([...handlers].map((handler) => handler(parsedEvent)))
      return persistedRecord
    },
    async listEvents(limit: number) {
      return dependencies.localStore?.listAutomationEvents(limit) ?? []
    },
    async markDelivered(eventId, deliveredAt = clock()) {
      await dependencies.localStore?.markAutomationEventDelivered(eventId, deliveredAt)
    },
    registerHandler(handler: AutomationHandler) {
      handlers.add(handler)
      return () => handlers.delete(handler)
    },
  }
}
