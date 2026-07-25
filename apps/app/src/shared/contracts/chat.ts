import type { DocumentNode, NoteDocument, TextNode } from '@/shared/contracts/document'

// Chat notes reuse the regular note document: one `chatLog` container whose
// children are `chatMessage` nodes carrying ordinary block content. Both node
// names live here (next to `imageBlockNodeName`) so templates, the chat
// service and the UI agree on them without depending on each other.
export const chatLogNodeName = 'chatLog'
export const chatMessageNodeName = 'chatMessage'
export const chatMessagesPerPage = 100

export type ChatMessageContent = Array<DocumentNode | TextNode>
export type ChatMessageSide = 'self' | 'other'

export type ChatMessage = {
  id: string
  createdAt: string
  editedAt: string | null
  pinnedAt: string | null
  side: ChatMessageSide
  senderName: string | null
  content: ChatMessageContent
}

export function createChatDocument(): NoteDocument {
  return {
    schemaVersion: 1,
    editor: 'tiptap',
    content: {
      type: 'doc',
      content: [{ type: chatLogNodeName, content: [] }],
    },
  }
}

export function isChatDocument(document: NoteDocument): boolean {
  return (document.content.content ?? []).some((node) => node.type === chatLogNodeName)
}
