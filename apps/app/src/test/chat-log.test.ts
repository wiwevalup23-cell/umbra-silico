import { describe, expect, it } from 'vitest'
import {
  appendChatMessage,
  parseChatMessages,
  removeChatMessage,
  updateChatMessage,
} from '@/chat'
import {
  chatLogNodeName,
  chatMessageNodeName,
  createChatDocument,
  isChatDocument,
  noteDocumentSchema,
  type NoteDocument,
} from '@/shared/contracts'

function textMessageContent(text: string) {
  return [{ type: 'paragraph', content: [{ type: 'text', text }] }]
}

describe('chat document contract', () => {
  it('creates a valid, serializable chat document', () => {
    const document = createChatDocument()

    expect(noteDocumentSchema.parse(JSON.parse(JSON.stringify(document)))).toEqual(document)
    expect(isChatDocument(document)).toBe(true)
  })

  it('does not mark regular documents as chat', () => {
    const regular: NoteDocument = {
      schemaVersion: 1,
      editor: 'tiptap',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    }

    expect(isChatDocument(regular)).toBe(false)
  })
})

describe('chat log algebra', () => {
  it('appends and parses messages in order', () => {
    let document = createChatDocument()
    document = appendChatMessage(document, {
      id: 'm1',
      createdAt: '2026-07-19T10:00:00.000Z',
      content: textMessageContent('first'),
    })
    document = appendChatMessage(document, {
      id: 'm2',
      createdAt: '2026-07-19T10:01:00.000Z',
      content: textMessageContent('second'),
    })

    const messages = parseChatMessages(document)

    expect(messages.map((message) => message.id)).toEqual(['m1', 'm2'])
    expect(messages[0]).toEqual({
      id: 'm1',
      createdAt: '2026-07-19T10:00:00.000Z',
      editedAt: null,
      content: textMessageContent('first'),
    })
    expect(noteDocumentSchema.parse(JSON.parse(JSON.stringify(document)))).toEqual(document)
  })

  it('never mutates the input document', () => {
    const document = createChatDocument()
    const snapshot = JSON.parse(JSON.stringify(document))

    appendChatMessage(document, {
      id: 'm1',
      createdAt: '2026-07-19T10:00:00.000Z',
      content: textMessageContent('first'),
    })

    expect(document).toEqual(snapshot)
  })

  it('updates a message and stamps editedAt', () => {
    let document = appendChatMessage(createChatDocument(), {
      id: 'm1',
      createdAt: '2026-07-19T10:00:00.000Z',
      content: textMessageContent('first'),
    })

    document = updateChatMessage(document, 'm1', {
      content: textMessageContent('changed'),
      editedAt: '2026-07-19T11:00:00.000Z',
    })

    expect(parseChatMessages(document)).toEqual([
      {
        id: 'm1',
        createdAt: '2026-07-19T10:00:00.000Z',
        editedAt: '2026-07-19T11:00:00.000Z',
        content: textMessageContent('changed'),
      },
    ])
  })

  it('removes only the addressed message', () => {
    let document = createChatDocument()

    for (const id of ['m1', 'm2', 'm3']) {
      document = appendChatMessage(document, {
        id,
        createdAt: '2026-07-19T10:00:00.000Z',
        content: textMessageContent(id),
      })
    }

    document = removeChatMessage(document, 'm2')

    expect(parseChatMessages(document).map((message) => message.id)).toEqual(['m1', 'm3'])
  })

  it('replaces empty message content with an empty paragraph', () => {
    const document = appendChatMessage(createChatDocument(), {
      id: 'm1',
      createdAt: '2026-07-19T10:00:00.000Z',
      content: [],
    })

    expect(parseChatMessages(document)[0]?.content).toEqual([{ type: 'paragraph' }])
  })

  it('appends a chat log to a non-chat note without destroying its blocks', () => {
    const regular: NoteDocument = {
      schemaVersion: 1,
      editor: 'tiptap',
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'existing' }] }],
      },
    }

    const document = appendChatMessage(regular, {
      id: 'm1',
      createdAt: '2026-07-19T10:00:00.000Z',
      content: textMessageContent('first'),
    })

    expect(document.content.content?.[0]).toEqual(regular.content.content?.[0])
    expect(document.content.content?.[1]?.type).toBe(chatLogNodeName)
    expect(parseChatMessages(document).map((message) => message.id)).toEqual(['m1'])
  })

  it('tolerates foreign and malformed nodes inside the log', () => {
    const document: NoteDocument = {
      schemaVersion: 1,
      editor: 'tiptap',
      content: {
        type: 'doc',
        content: [
          {
            type: chatLogNodeName,
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'stray block' }] },
              { type: chatMessageNodeName },
              {
                type: chatMessageNodeName,
                attrs: { id: 'm2', createdAt: '2026-07-19T10:00:00.000Z' },
                content: textMessageContent('ok'),
              },
            ],
          },
        ],
      },
    }

    const messages = parseChatMessages(document)

    expect(messages).toHaveLength(2)
    expect(messages[0]?.id).toBe(`${chatMessageNodeName}-1`)
    expect(messages[0]?.createdAt).toBe('')
    expect(messages[1]?.id).toBe('m2')
  })

  it('returns no messages for documents without a chat log', () => {
    const regular: NoteDocument = {
      schemaVersion: 1,
      editor: 'tiptap',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    }

    expect(parseChatMessages(regular)).toEqual([])
  })
})
