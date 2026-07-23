import {
  chatLogNodeName,
  chatMessageNodeName,
  type ChatMessage,
  type ChatMessageContent,
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

function findChatLog(document: NoteDocument): DocumentNode | null {
  for (const node of document.content.content ?? []) {
    if (isDocumentNode(node) && node.type === chatLogNodeName) {
      return node
    }
  }

  return null
}

function normalizeMessageContent(content: ChatMessageContent): ChatMessageContent {
  return content.length > 0 ? content : [{ type: 'paragraph' }]
}

export function parseChatMessages(document: NoteDocument): ChatMessage[] {
  const log = findChatLog(document)

  if (!log?.content) {
    return []
  }

  const messages: ChatMessage[] = []

  log.content.forEach((node, index) => {
    if (!isDocumentNode(node) || node.type !== chatMessageNodeName) {
      return
    }

    // Fallbacks keep parsing total: a hand-edited or partially restored node
    // still shows up in the feed instead of silently disappearing.
    messages.push({
      id: readStringAttr(node, 'id') ?? `${chatMessageNodeName}-${index}`,
      createdAt: readStringAttr(node, 'createdAt') ?? '',
      editedAt: readStringAttr(node, 'editedAt'),
      content: node.content ?? [],
    })
  })

  return messages
}

function withFirstChatLog(
  document: NoteDocument,
  transform: (children: AnyNode[]) => AnyNode[],
): NoteDocument {
  const rootChildren = document.content.content ?? []
  const hasLog = rootChildren.some(
    (node) => isDocumentNode(node) && node.type === chatLogNodeName,
  )
  // Converting an existing note into a chat must never destroy content: the
  // log is appended after whatever blocks the note already has.
  const base: AnyNode[] = hasLog
    ? rootChildren
    : [...rootChildren, { type: chatLogNodeName, content: [] }]

  let transformed = false
  const nextChildren = base.map((node) => {
    if (transformed || !isDocumentNode(node) || node.type !== chatLogNodeName) {
      return node
    }

    transformed = true
    return { ...node, content: transform(node.content ?? []) }
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
  return withFirstChatLog(document, (children) => [
    ...children,
    {
      type: chatMessageNodeName,
      attrs: { id: input.id, createdAt: input.createdAt },
      content: normalizeMessageContent(input.content),
    },
  ])
}

export function updateChatMessage(
  document: NoteDocument,
  messageId: string,
  patch: UpdateChatMessagePatch,
): NoteDocument {
  return withFirstChatLog(document, (children) =>
    children.map((node) => {
      if (
        !isDocumentNode(node) ||
        node.type !== chatMessageNodeName ||
        readStringAttr(node, 'id') !== messageId
      ) {
        return node
      }

      return {
        ...node,
        attrs: { ...node.attrs, editedAt: patch.editedAt },
        content: normalizeMessageContent(patch.content),
      }
    }),
  )
}

export function removeChatMessage(document: NoteDocument, messageId: string): NoteDocument {
  return withFirstChatLog(document, (children) =>
    children.filter(
      (node) =>
        !isDocumentNode(node) ||
        node.type !== chatMessageNodeName ||
        readStringAttr(node, 'id') !== messageId,
    ),
  )
}
