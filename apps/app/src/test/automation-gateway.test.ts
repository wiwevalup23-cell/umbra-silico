import { describe, expect, it, vi } from 'vitest'
import type { LiveQuery, NoteRepository } from '@/repository/contracts'
import {
  automationEventIdSchema,
  createDraftLocalNote,
  deviceIdSchema,
  documentV1Contract,
  noteIdSchema,
  userIdSchema,
  type AutomationEventRecord,
  type LocalNote,
  type NoteDetail,
  type NoteId,
  type NoteListItem,
} from '@/shared/contracts'
import {
  automationLocalApiContract,
  DefaultAutomationGateway,
  createAutomationEventBus,
} from '@/automation'

const userId = userIdSchema.parse('automation_user')
const deviceId = deviceIdSchema.parse('automation_device')
const noteId = noteIdSchema.parse('note_automation_1')
const now = '2026-07-05T15:00:00.000Z'
const deliveredAt = '2026-07-05T15:01:00.000Z'

function createStaticLiveQuery<TValue>(value: TValue): LiveQuery<TValue> {
  return {
    dispose: () => undefined,
    retain: () => undefined,
    getSnapshot: () => value,
    subscribe: () => () => undefined,
  }
}

function makePlainNote(id: NoteId = noteId): LocalNote {
  return {
    ...createDraftLocalNote({
      deviceId,
      document: {
        ...documentV1Contract.createEmpty(),
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Automation body' }],
            },
          ],
        },
      },
      id,
      now,
      title: 'Automation note',
      userId,
    }),
    localRevision: 1,
    preview: 'Automation body',
  }
}

function makeLockedNote(): LocalNote {
  return {
    ...makePlainNote(),
    title: null,
    preview: null,
    isLocked: true,
    document: null,
    encryptedPayload: 'ciphertext.base64',
    encryption: {
      version: 1,
      algorithm: 'AES-GCM-256',
      payloadNonce: 'payload-nonce',
      wrappedDek: 'wrapped-dek',
      wrapNonce: 'wrap-nonce',
    },
  }
}

function createMockRepository(note: NoteDetail | null = makePlainNote()): NoteRepository {
  return {
    liveNoteList: vi.fn(() => createStaticLiveQuery<NoteListItem[]>([])),
    liveTrashList: vi.fn(() => createStaticLiveQuery<NoteListItem[]>([])),
    liveFolderTree: vi.fn(() => createStaticLiveQuery([])),
    liveNote: vi.fn(() => createStaticLiveQuery<NoteDetail | null>(note)),
    readBackupData: vi.fn(async () => ({ cryptoProfile: null, folders: [], notes: [] })),
    restoreBackupData: vi.fn(async () => ({
      cryptoProfileRestored: false,
      foldersAdded: 0,
      foldersSkipped: 0,
      notesAdded: 0,
      notesSkipped: 0,
    })),
    listNoteVersions: vi.fn(async () => []),
    restoreNoteVersion: vi.fn(async () => undefined),
    getNote: vi.fn(async () => note),
    createFolder: vi.fn(async () => {
      throw new Error('Not implemented in automation gateway tests.')
    }),
    createNote: vi.fn(async () => noteId),
    deleteFolder: vi.fn(async () => undefined),
    updateNote: vi.fn(async () => undefined),
    deleteNote: vi.fn(async () => undefined),
    moveFolder: vi.fn(async () => undefined),
    moveNoteToFolder: vi.fn(async () => undefined),
    purgeNote: vi.fn(async () => undefined),
    renameFolder: vi.fn(async () => undefined),
    restoreNote: vi.fn(async () => undefined),
    lockNote: vi.fn(async () => ({ recoveryKey: null })),
    unlockNoteForSession: vi.fn(async () => ({
      noteId,
      expiresAt: deliveredAt,
    })),
    getPendingOps: vi.fn(async () => []),
    getLastServerRevision: vi.fn(async () => 0),
    markOpSynced: vi.fn(async () => undefined),
    markOpFailed: vi.fn(async () => undefined),
    setLastServerRevision: vi.fn(async () => undefined),
    applyRemoteChange: vi.fn(async () => undefined),
    markConflict: vi.fn(async () => undefined),
  }
}

describe('Automation Gateway foundation', () => {
  it('persists internal automation events before dispatching handlers', async () => {
    const events: AutomationEventRecord[] = []
    const handler = vi.fn()
    const eventBus = createAutomationEventBus({
      clock: () => now,
      idFactory: () => 'automation_event_1',
      userId,
      localStore: {
        async appendAutomationEvent(event) {
          events.push(event)
        },
        async listAutomationEvents(limit) {
          return events.slice(0, limit)
        },
        async markAutomationEventDelivered(eventId, nextDeliveredAt) {
          const event = events.find((candidate) => candidate.id === eventId)

          if (event) {
            event.deliveredAt = nextDeliveredAt
          }
        },
      },
    })

    eventBus.registerHandler(handler)
    const record = await eventBus.emit({ type: 'note.created', noteId })

    if (!record) {
      throw new Error('Expected persisted automation event record.')
    }

    expect(record).toEqual({
      id: automationEventIdSchema.parse('automation_event_1'),
      userId,
      noteId,
      event: { type: 'note.created', noteId },
      eventType: 'note.created',
      createdAt: now,
      deliveredAt: null,
    })
    expect(events).toEqual([record])
    expect(handler).toHaveBeenCalledWith({ type: 'note.created', noteId })

    await eventBus.markDelivered(record.id, deliveredAt)

    expect(await eventBus.listEvents(10)).toEqual([
      {
        ...record,
        deliveredAt,
      },
    ])
  })

  it('routes automation writes through Repository and emits internal events', async () => {
    const repository = createMockRepository()
    const handledEvents: unknown[] = []
    const eventBus = createAutomationEventBus()
    const gateway = new DefaultAutomationGateway({
      eventBus,
      noteRepository: repository,
    })

    gateway.registerHandler((event) => {
      handledEvents.push(event)
    })

    await gateway.createNote({ title: 'Created by automation' })
    await gateway.updateNote(noteId, { title: 'Updated by automation' })
    await gateway.deleteNote(noteId)

    expect(repository.createNote).toHaveBeenCalledWith({
      title: 'Created by automation',
    })
    expect(repository.updateNote).toHaveBeenCalledWith(noteId, {
      title: 'Updated by automation',
    })
    expect(repository.deleteNote).toHaveBeenCalledWith(noteId)
    expect(handledEvents).toEqual([
      { type: 'note.created', noteId },
      { type: 'note.updated', noteId, changedFields: ['title'] },
      { type: 'note.deleted', noteId },
    ])
  })

  it('reads locked notes only as encrypted records unless a future plaintext grant exists', async () => {
    const repository = createMockRepository(makeLockedNote())
    const gateway = new DefaultAutomationGateway({ noteRepository: repository })

    await expect(gateway.readNote(noteId)).resolves.toMatchObject({
      isLocked: true,
      title: null,
      preview: null,
      document: null,
      encryptedPayload: 'ciphertext.base64',
    })
    await expect(
      gateway.readNote(noteId, {
        mode: 'plaintext',
        unlockGrant: {
          noteId,
          scope: 'automation.read.plaintext',
          issuedAt: now,
          expiresAt: deliveredAt,
        },
      }),
    ).rejects.toThrow('not implemented in MVP')
    expect(repository.getNote).toHaveBeenCalledWith(noteId)
  })

  it('describes the future local API without implementing a server transport', () => {
    const repository = createMockRepository()
    const gateway = new DefaultAutomationGateway({ noteRepository: repository })

    expect(gateway.getLocalApiContract()).toEqual(automationLocalApiContract)
    expect(gateway.getLocalApiContract()).toMatchObject({
      basePath: '/v1',
      enabledByDefault: false,
      transport: 'post-mvp-local-http',
    })
    expect(gateway.getLocalApiContract().endpoints.every((endpoint) => {
      return endpoint.implemented === false
    })).toBe(true)
  })
})
