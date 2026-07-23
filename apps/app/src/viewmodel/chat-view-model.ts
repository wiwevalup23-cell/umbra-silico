import { useCallback, useMemo, useRef } from 'react'
import {
  appendChatMessage,
  parseChatMessages,
  removeChatMessage,
  updateChatMessage,
} from '@/chat'
import {
  imageBlockNodeName,
  isChatDocument,
  type ChatMessage,
  type ChatMessageContent,
  type NoteDetail,
  type NoteDocument,
  type NoteId,
} from '@/shared/contracts'
import { useNoteRepository } from '@/viewmodel/repository-hooks'

export type ChatImageMessageInput = {
  imageId: string
  width: number
  height: number
}

export type ChatViewModel = {
  isChatNote: boolean
  messages: ChatMessage[]
  deleteMessage(messageId: string): Promise<void>
  editMessage(messageId: string, content: ChatMessageContent): Promise<void>
  sendImageMessage(image: ChatImageMessageInput): Promise<void>
  sendMessage(content: ChatMessageContent): Promise<void>
}

type UpdateDocumentFn = (noteId: NoteId, document: NoteDocument) => Promise<void>

export function useChatViewModel(
  note: NoteDetail | null,
  updateDocument: UpdateDocumentFn,
): ChatViewModel {
  const repository = useNoteRepository()
  // The properties flag is authoritative; the structural check keeps a chat
  // note out of the block editor even if its kind was lost, because the block
  // editor would drop the unknown chat nodes and wipe the feed on autosave.
  const chatNote =
    note && !note.isLocked && (note.properties?.kind === 'chat' || isChatDocument(note.document))
      ? note
      : null
  const chatNoteId = chatNote?.id ?? null
  const chatDocument = chatNote?.document ?? null

  const messages = useMemo(
    () => (chatDocument ? parseChatMessages(chatDocument) : []),
    [chatDocument],
  )

  // Commands are serialized and always re-read the note before mutating, so
  // two rapid sends cannot both build on the same stale document.
  const queueRef = useRef<Promise<void>>(Promise.resolve())

  const mutateDocument = useCallback(
    (mutate: (document: NoteDocument) => NoteDocument): Promise<void> => {
      const noteId = chatNoteId

      if (!noteId) {
        return Promise.resolve()
      }

      const task = queueRef.current.then(async () => {
        const fresh = await repository.getNote(noteId)

        if (!fresh || fresh.isLocked) {
          return
        }

        await updateDocument(noteId, mutate(fresh.document))
      })

      queueRef.current = task.catch(() => undefined)
      return task
    },
    [chatNoteId, repository, updateDocument],
  )

  const sendMessage = useCallback(
    (content: ChatMessageContent) =>
      mutateDocument((document) =>
        appendChatMessage(document, {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          content,
        }),
      ),
    [mutateDocument],
  )

  const sendImageMessage = useCallback(
    (image: ChatImageMessageInput) =>
      sendMessage([
        {
          type: imageBlockNodeName,
          attrs: {
            imageId: image.imageId,
            naturalWidth: image.width,
            naturalHeight: image.height,
          },
        },
      ]),
    [sendMessage],
  )

  const editMessage = useCallback(
    (messageId: string, content: ChatMessageContent) =>
      mutateDocument((document) =>
        updateChatMessage(document, messageId, {
          content,
          editedAt: new Date().toISOString(),
        }),
      ),
    [mutateDocument],
  )

  const deleteMessage = useCallback(
    (messageId: string) => mutateDocument((document) => removeChatMessage(document, messageId)),
    [mutateDocument],
  )

  return {
    isChatNote: chatNote !== null,
    messages,
    deleteMessage,
    editMessage,
    sendImageMessage,
    sendMessage,
  }
}
