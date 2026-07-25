import type { ChatMessageContent } from '@/shared/contracts/chat'
import type { NoteId } from '@/shared/contracts/note'

export type TelegramAttachmentKind = 'image' | 'sticker' | 'file'

export type TelegramAttachment = {
  kind: TelegramAttachmentKind
  path: string
}

export type TelegramParsedMessage = {
  attachmentPaths: TelegramAttachment[]
  content: ChatMessageContent
  createdAt: string
  externalId: string
  forwardedFrom: string | null
  replyToExternalId: string | null
  senderName: string
}

export type TelegramParticipant = {
  messageCount: number
  name: string
}

export type TelegramExportFolder = {
  attachmentCount: number
  availableAttachmentCount: number
  filesByPath: ReadonlyMap<string, File>
  messages: TelegramParsedMessage[]
  missingAttachmentPaths: string[]
  participants: TelegramParticipant[]
  rootName: string
  sourceFiles: string[]
  suggestedSelfParticipant: string | null
  title: string
  warnings: string[]
}

export type TelegramImportProgress = {
  completedAttachments: number
  phase: 'creating' | 'attachments' | 'saving'
  totalAttachments: number
}

export type TelegramImportResult = {
  importedAttachmentCount: number
  importedMessageCount: number
  noteId: NoteId
  skippedAttachmentCount: number
  warnings: string[]
}
