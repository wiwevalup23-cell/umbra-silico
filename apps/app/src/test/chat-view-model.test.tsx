import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NoteRepository } from '@/repository/contracts'
import { parseChatMessages } from '@/chat'
import {
  createChatDocument,
  createDraftLocalNote,
  deviceIdSchema,
  noteIdSchema,
  notePropertiesSchema,
  userIdSchema,
  type LocalNote,
  type NoteDocument,
  type NoteId,
} from '@/shared/contracts'
import { RepositoryProvider, useChatViewModel, type ChatViewModel } from '@/viewmodel'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const userId = userIdSchema.parse('chat_vm_user')
const deviceId = deviceIdSchema.parse('chat_vm_device')
const chatNoteId = noteIdSchema.parse('note_chat_vm')
const now = '2026-07-19T10:00:00.000Z'

function makeChatNote(document: NoteDocument = createChatDocument()): LocalNote {
  return {
    ...createDraftLocalNote({
      id: chatNoteId,
      userId,
      deviceId,
      now,
      title: 'Saved Messages',
      document,
      properties: notePropertiesSchema.parse({ kind: 'chat', status: 'none', tags: [] }),
    }),
  }
}

function textMessageContent(text: string) {
  return [{ type: 'paragraph', content: [{ type: 'text', text }] }]
}

// The chat ViewModel only reads notes; a persistent store simulates the
// repository so serialized sends can observe each other's writes.
function createChatHarness(initialNote: LocalNote) {
  let storedNote = initialNote

  const repository = {
    getNote: vi.fn(async () => storedNote),
  } as unknown as NoteRepository

  const updateDocument = vi.fn(async (_noteId: NoteId, document: NoteDocument) => {
    storedNote = { ...storedNote, document } as LocalNote
  })

  return {
    getStoredNote: () => storedNote,
    repository,
    updateDocument,
  }
}

const cleanupTasks: Array<() => void> = []

afterEach(() => {
  while (cleanupTasks.length > 0) {
    cleanupTasks.pop()?.()
  }
})

function renderChatProbe(
  repository: NoteRepository,
  note: LocalNote | null,
  updateDocument: (noteId: NoteId, document: NoteDocument) => Promise<void>,
) {
  let latest: ChatViewModel | null = null

  function ChatProbe() {
    const viewModel = useChatViewModel(note, updateDocument)

    useEffect(() => {
      latest = viewModel
    }, [viewModel])

    return (
      <output>
        {viewModel.isChatNote ? 'chat' : 'standard'}:{viewModel.messages.length}
      </output>
    )
  }

  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <RepositoryProvider repository={repository}>
        <ChatProbe />
      </RepositoryProvider>,
    )
  })

  cleanupTasks.push(() => {
    act(() => root.unmount())
    container.remove()
  })

  return {
    container,
    viewModel: () => {
      if (!latest) throw new Error('Chat view model probe did not mount.')
      return latest
    },
  }
}

describe('useChatViewModel', () => {
  it('recognizes chat notes and projects their messages', () => {
    const harness = createChatHarness(makeChatNote())
    const rendered = renderChatProbe(
      harness.repository,
      harness.getStoredNote(),
      harness.updateDocument,
    )

    expect(rendered.container.textContent).toBe('chat:0')
  })

  it('treats standard and locked notes as non-chat', () => {
    const harness = createChatHarness(makeChatNote())
    const standardNote = createDraftLocalNote({
      id: chatNoteId,
      userId,
      deviceId,
      now,
      title: 'Regular page',
    })

    const rendered = renderChatProbe(harness.repository, standardNote, harness.updateDocument)

    expect(rendered.container.textContent).toBe('standard:0')
  })

  it('sends a message by appending to the freshly read document', async () => {
    const harness = createChatHarness(makeChatNote())
    const rendered = renderChatProbe(
      harness.repository,
      harness.getStoredNote(),
      harness.updateDocument,
    )

    await act(async () => {
      await rendered.viewModel().sendMessage(textMessageContent('hello'))
    })

    expect(harness.updateDocument).toHaveBeenCalledTimes(1)
    const storedNote = harness.getStoredNote()
    const messages = storedNote.isLocked ? [] : parseChatMessages(storedNote.document)
    expect(messages).toHaveLength(1)
    expect(messages[0]?.content).toEqual(textMessageContent('hello'))
    expect(messages[0]?.id.length).toBeGreaterThan(0)
    expect(Number.isNaN(Date.parse(messages[0]?.createdAt ?? ''))).toBe(false)
  })

  it('serializes rapid sends so no message is lost', async () => {
    const harness = createChatHarness(makeChatNote())
    const rendered = renderChatProbe(
      harness.repository,
      harness.getStoredNote(),
      harness.updateDocument,
    )

    await act(async () => {
      await Promise.all([
        rendered.viewModel().sendMessage(textMessageContent('first')),
        rendered.viewModel().sendMessage(textMessageContent('second')),
      ])
    })

    const storedNote = harness.getStoredNote()
    const messages = storedNote.isLocked ? [] : parseChatMessages(storedNote.document)
    expect(messages.map((message) => message.content)).toEqual([
      textMessageContent('first'),
      textMessageContent('second'),
    ])
  })

  it('can write a message as the interlocutor', async () => {
    const harness = createChatHarness(makeChatNote())
    const rendered = renderChatProbe(
      harness.repository,
      harness.getStoredNote(),
      harness.updateDocument,
    )

    await act(async () => {
      await rendered.viewModel().sendMessage(textMessageContent('other side'), {
        senderName: 'Kitchen Friend',
        side: 'other',
      })
    })

    const storedNote = harness.getStoredNote()
    const messages = storedNote.isLocked ? [] : parseChatMessages(storedNote.document)

    expect(messages[0]).toEqual(
      expect.objectContaining({
        senderName: 'Kitchen Friend',
        side: 'other',
      }),
    )
  })

  it('edits and deletes messages by id', async () => {
    const harness = createChatHarness(makeChatNote())
    const rendered = renderChatProbe(
      harness.repository,
      harness.getStoredNote(),
      harness.updateDocument,
    )

    await act(async () => {
      await rendered.viewModel().sendMessage(textMessageContent('keep'))
      await rendered.viewModel().sendMessage(textMessageContent('drop'))
    })

    const read = () => {
      const storedNote = harness.getStoredNote()
      return storedNote.isLocked ? [] : parseChatMessages(storedNote.document)
    }
    const [keep, drop] = read()

    await act(async () => {
      await rendered.viewModel().editMessage(keep!.id, textMessageContent('kept and edited'))
      await rendered.viewModel().setMessagePinned(keep!.id, true)
      await rendered.viewModel().deleteMessage(drop!.id)
    })

    const messages = read()
    expect(messages).toHaveLength(1)
    expect(messages[0]?.content).toEqual(textMessageContent('kept and edited'))
    expect(messages[0]?.editedAt).not.toBeNull()
    expect(messages[0]?.pinnedAt).not.toBeNull()
  })

  it('sends image messages as image block nodes', async () => {
    const harness = createChatHarness(makeChatNote())
    const rendered = renderChatProbe(
      harness.repository,
      harness.getStoredNote(),
      harness.updateDocument,
    )

    await act(async () => {
      await rendered.viewModel().sendImageMessage({ imageId: 'img_1', width: 640, height: 480 })
    })

    const storedNote = harness.getStoredNote()
    const messages = storedNote.isLocked ? [] : parseChatMessages(storedNote.document)
    expect(messages[0]?.content).toEqual([
      {
        type: 'imageBlock',
        attrs: { imageId: 'img_1', naturalWidth: 640, naturalHeight: 480 },
      },
    ])
  })
})
