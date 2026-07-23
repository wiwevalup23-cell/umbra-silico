import { describe, expect, it } from 'vitest'
import { createNoteFromTemplate } from '@/shared/note-templates'
import {
  automationEventIdSchema,
  automationEventRecordSchema,
  automationEventSchema,
  automationUnlockGrantSchema,
  createDraftLocalNote,
  currentDocumentSchemaVersion,
  documentV1Contract,
  encryptedLocalNoteSchema,
  emptyDocumentV1,
  isChatDocument,
  isJsonValue,
  localNoteSchema,
  noteDocumentSchema,
  noteEncryptionMetadataSchema,
  notePropertiesSchema,
  noteIdSchema,
  parseAutomationEvent,
  parseAutomationEventRecord,
  parseLocalNote,
  parseNoteDocument,
  parseSyncOperation,
  plaintextLocalNoteSchema,
  syncOperationSchema,
  userIdSchema,
  deviceIdSchema,
  operationIdSchema,
  normalizeNoteTags,
} from '@/shared/contracts'

const noteId = noteIdSchema.parse('note_1')
const userId = userIdSchema.parse('user_1')
const deviceId = deviceIdSchema.parse('device_1')
const operationId = operationIdSchema.parse('op_1')
const now = '2026-07-03T00:00:00.000Z'

describe('shared contract validation', () => {
  it('validates the current document-v1 JSON shape without React', () => {
    expect(currentDocumentSchemaVersion).toBe(1)
    expect(parseNoteDocument(emptyDocumentV1)).toEqual(emptyDocumentV1)
    expect(documentV1Contract.schema.parse(documentV1Contract.createEmpty())).toEqual(
      emptyDocumentV1,
    )
  })

  it('rejects document roots that are not tiptap doc nodes', () => {
    expect(
      noteDocumentSchema.safeParse({
        schemaVersion: 1,
        editor: 'tiptap',
        content: { type: 'paragraph', content: [] },
      }).success,
    ).toBe(false)
  })

  it('separates plaintext and encrypted local note states', () => {
    const plaintextNote = createDraftLocalNote({
      id: noteId,
      userId,
      deviceId,
      now,
      title: 'Plain note',
    })

    expect(plaintextLocalNoteSchema.parse(plaintextNote).isLocked).toBe(false)
    expect(parseLocalNote(plaintextNote).document).toEqual(emptyDocumentV1)

    const encryptedNote = {
      ...plaintextNote,
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

    expect(encryptedLocalNoteSchema.parse(encryptedNote).isLocked).toBe(true)
    expect(localNoteSchema.safeParse(encryptedNote).success).toBe(true)
  })

  it('normalizes persisted page tags and validates the focused property model', () => {
    expect(normalizeNoteTags([' Work ', '#work', 'Research notes', '', '#Ideas'])).toEqual([
      'Work',
      'Research notes',
      'Ideas',
    ])
    expect(notePropertiesSchema.parse({ status: 'active', tags: ['Work'] })).toEqual({
      kind: 'standard',
      status: 'active',
      tags: ['Work'],
    })
    expect(notePropertiesSchema.parse({ kind: 'chat', status: 'none', tags: [] }).kind).toBe('chat')
    expect(notePropertiesSchema.safeParse({ kind: 'stream', status: 'none', tags: [] }).success).toBe(false)
    expect(notePropertiesSchema.safeParse({ status: 'blocked', tags: [] }).success).toBe(false)
    expect(notePropertiesSchema.safeParse({
      status: 'custom:%E2%9C%A6:In%20review',
      tags: [],
    }).success).toBe(true)
  })

  it('creates valid built-in note templates with real starting properties', () => {
    const daily = createNoteFromTemplate('daily', new Date('2026-07-16T12:00:00.000Z'))
    const meeting = createNoteFromTemplate('meeting')

    expect(noteDocumentSchema.parse(daily.document).content.content?.length).toBeGreaterThan(2)
    expect(daily.properties).toEqual({ kind: 'standard', status: 'active', tags: ['daily'] })
    expect(meeting.properties).toEqual({ kind: 'standard', status: 'active', tags: ['meeting'] })

    const chat = createNoteFromTemplate('chat')

    expect(chat.title).toBe('Saved Messages')
    expect(chat.properties).toEqual({ kind: 'chat', status: 'none', tags: [] })
    expect(chat.document ? isChatDocument(noteDocumentSchema.parse(chat.document)) : false).toBe(
      true,
    )
  })

  it('rejects locked notes that still persist plaintext document data', () => {
    const invalidLockedNote = {
      ...createDraftLocalNote({
        id: noteId,
        userId,
        deviceId,
        now,
      }),
      isLocked: true,
      encryptedPayload: 'ciphertext.base64',
      encryption: noteEncryptionMetadataSchema.parse({
        version: 1,
        algorithm: 'AES-GCM-256',
        payloadNonce: 'payload-nonce',
        wrappedDek: 'wrapped-dek',
        wrapNonce: 'wrap-nonce',
      }),
    }

    expect(localNoteSchema.safeParse(invalidLockedNote).success).toBe(false)
  })

  it('keeps sync operations JSON-serializable', () => {
    const operation = parseSyncOperation({
      opId: operationId,
      noteId,
      userId,
      deviceId,
      type: 'note.update',
      payload: {
        title: 'Serializable update',
        revision: 1,
        changed: true,
        tags: ['phase-1'],
      },
      baseRemoteRevision: null,
      createdAt: now,
      attemptCount: 0,
      lastError: null,
      status: 'pending',
    })

    expect(isJsonValue(operation.payload)).toBe(true)
    expect(JSON.parse(JSON.stringify(operation))).toEqual(operation)

    expect(
      syncOperationSchema.safeParse({
        ...operation,
        payload: { bad: () => 'not-json' },
      }).success,
    ).toBe(false)
  })

  it('validates automation events as pure shared contracts', () => {
    const event = parseAutomationEvent({
      type: 'note.updated',
      noteId,
      changedFields: ['title', 'document'],
    })

    expect(event.type).toBe('note.updated')
    expect(automationEventSchema.safeParse(event).success).toBe(true)
  })

  it('validates persisted automation event records and future unlock grant shape', () => {
    const record = parseAutomationEventRecord({
      id: automationEventIdSchema.parse('automation_event_1'),
      userId,
      noteId,
      event: {
        type: 'note.locked',
        noteId,
      },
      eventType: 'note.locked',
      createdAt: now,
      deliveredAt: null,
    })

    expect(automationEventRecordSchema.parse(record)).toEqual(record)
    expect(
      automationUnlockGrantSchema.parse({
        noteId,
        scope: 'automation.read.plaintext',
        issuedAt: now,
        expiresAt: '2026-07-03T00:15:00.000Z',
      }),
    ).toMatchObject({
      scope: 'automation.read.plaintext',
    })
  })
})
