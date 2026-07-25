import {
  chatLogNodeName,
  chatMessagesPerPage,
  chatMessageNodeName,
  type ChatMessage,
  type ChatMessageContent,
  type ChatMessageSide,
} from '@/shared/contracts/chat'
import type { DocumentNode, NoteDocument, TextNode } from '@/shared/contracts/document'

// Pure message algebra over the note document. No React, no stores, no other
// layers: every function takes a document and returns a new document, so the
// ViewModel can ride the existing updateNote/image-GC/sync pipeline.

type AnyNode = DocumentNode | TextNode

export type AppendChatMessageInput = {
  id: string
  createdAt: string
  content: ChatMessageContent
  side?: ChatMessageSide
  senderName?: string | null
}

export type UpdateChatMessagePatch = {
  content: ChatMessageContent
  editedAt: string
}

function isDocumentNode(node: AnyNode): node is DocumentNode {
  return node.type !== 'text'
}

function readStringAttr(node: DocumentNode, key: string): string | null {
  const value = node.attrs?.[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function readMessageSide(node: DocumentNode): ChatMessageSide {
  return readStringAttr(node, 'side') === 'other' ? 'other' : 'self'
}

function isChatLog(node: AnyNode): node is DocumentNode {
  return isDocumentNode(node) && node.type === chatLogNodeName
}

function normalizeMessageContent(content: ChatMessageContent): ChatMessageContent {
  return content.length > 0 ? content : [{ type: 'paragraph' }]
}

function createChatMessageNode(input: AppendChatMessageInput): DocumentNode {
  return {
    type: chatMessageNodeName,
    attrs: {
      id: input.id,
      createdAt: input.createdAt,
      side: input.side ?? 'self',
      ...(input.senderName ? { senderName: input.senderName } : {}),
    },
    content: normalizeMessageContent(input.content),
  }
}

export function createChatDocumentFromMessages(
  messages: AppendChatMessageInput[],
): NoteDocument {
  const pages: DocumentNode[] = []

  for (let start = 0; start < messages.length; start += chatMessagesPerPage) {
    pages.push({
      type: chatLogNodeName,
      attrs: { page: pages.length },
      content: messages
        .slice(start, start + chatMessagesPerPage)
        .map(createChatMessageNode),
    })
  }

  return {
    schemaVersion: 1,
    editor: 'tiptap',
    content: {
      type: 'doc',
      content:
        pages.length > 0
          ? pages
          : [{ type: chatLogNodeName, attrs: { page: 0 }, content: [] }],
    },
  }
}

export function parseChatMessages(document: NoteDocument): ChatMessage[] {
  const messages: ChatMessage[] = []

  ;(document.content.content ?? []).forEach((log, pageIndex) => {
    if (!isChatLog(log)) {
      return
    }

    ;(log.content ?? []).forEach((node, messageIndex) => {
      if (!isDocumentNode(node) || node.type !== chatMessageNodeName) {
        return
      }

      // Fallbacks keep parsing total: a hand-edited or partially restored node
      // still shows up in the feed instead of silently disappearing.
      messages.push({
        id:
          readStringAttr(node, 'id') ??
          `${chatMessageNodeName}-${pageIndex}-${messageIndex}`,
        createdAt: readStringAttr(node, 'createdAt') ?? '',
        editedAt: readStringAttr(node, 'editedAt'),
        pinnedAt: readStringAttr(node, 'pinnedAt'),
        side: readMessageSide(node),
        senderName: readStringAttr(node, 'senderName'),
        content: node.content ?? [],
      })
    })
  })

  return messages
}

function mapChatMessages(
  document: NoteDocument,
  transform: (node: DocumentNode) => DocumentNode | null,
): NoteDocument {
  const rootChildren = document.content.content ?? []
  let transformed = false
  const nextChildren = rootChildren.map((node) => {
    if (!isChatLog(node)) {
      return node
    }

    return {
      ...node,
      content: (node.content ?? []).flatMap((child) => {
        if (
          transformed ||
          !isDocumentNode(child) ||
          child.type !== chatMessageNodeName
        ) {
          return [child]
        }

        const next = transform(child)

        if (next !== child) {
          transformed = true
        }

        return next ? [next] : []
      }),
    }
  })

  return {
    ...document,
    content: { ...document.content, content: nextChildren },
  }
}

export function appendChatMessage(
  document: NoteDocument,
  input: AppendChatMessageInput,
): NoteDocument {
  const rootChildren = document.content.content ?? []
  const newMessage = createChatMessageNode(input)
  const lastLogIndex = rootChildren.findLastIndex(isChatLog)

  // Chat pages keep message algebra bounded and establish a migration-safe
  // seam for moving pages into their own persistence records later. Legacy
  // documents with one unpaged chatLog remain fully readable.
  if (lastLogIndex < 0) {
    return {
      ...document,
      content: {
        ...document.content,
        content: [
          ...rootChildren,
          { type: chatLogNodeName, attrs: { page: 0 }, content: [newMessage] },
        ],
      },
    }
  }

  const lastLog = rootChildren[lastLogIndex] as DocumentNode
  const messageCount = (lastLog.content ?? []).filter(
    (node) => isDocumentNode(node) && node.type === chatMessageNodeName,
  ).length

  if (messageCount >= chatMessagesPerPage) {
    const pageCount = rootChildren.filter(isChatLog).length

    return {
      ...document,
      content: {
        ...document.content,
        content: [
          ...rootChildren,
          {
            type: chatLogNodeName,
            attrs: { page: pageCount },
            content: [newMessage],
          },
        ],
      },
    }
  }

  return {
    ...document,
    content: {
      ...document.content,
      content: rootChildren.map((node, index) =>
        index === lastLogIndex
          ? { ...lastLog, content: [...(lastLog.content ?? []), newMessage] }
          : node,
      ),
    },
  }
}

export function updateChatMessage(
  document: NoteDocument,
  messageId: string,
  patch: UpdateChatMessagePatch,
): NoteDocument {
  return mapChatMessages(document, (node) =>
    readStringAttr(node, 'id') === messageId
      ? {
          ...node,
          attrs: { ...node.attrs, editedAt: patch.editedAt },
          content: normalizeMessageContent(patch.content),
        }
      : node,
  )
}

export function removeChatMessage(document: NoteDocument, messageId: string): NoteDocument {
  return mapChatMessages(document, (node) =>
    readStringAttr(node, 'id') === messageId ? null : node,
  )
}

export function setChatMessagePinned(
  document: NoteDocument,
  messageId: string,
  pinnedAt: string | null,
): NoteDocument {
  return mapChatMessages(document, (node) => {
    if (readStringAttr(node, 'id') !== messageId) {
      return node
    }

    const attrs = { ...node.attrs }

    if (pinnedAt) {
      attrs.pinnedAt = pinnedAt
    } else {
      delete attrs.pinnedAt
    }

    return { ...node, attrs }
  })
}
