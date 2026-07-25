import { createChatDocumentFromMessages } from '@/chat'
import type {
  TelegramExportFolder,
  TelegramImportProgress,
  TelegramImportResult,
  TelegramParsedMessage,
} from '@/shared/contracts'
import type { ImageRepository, NoteRepository } from '@/repository/contracts'
import {
  collectImageIdsFromDocument,
  type ChatMessageContent,
  type DocumentNode,
  type FolderId,
  type NoteDocument,
  type TextNode,
} from '@/shared/contracts'

type TelegramImportDependencies = {
  imageRepository: ImageRepository | null
  noteRepository: NoteRepository
  onProgress?: (progress: TelegramImportProgress) => void
  requestSync?: () => void
}

type ImportTelegramChatInput = {
  exportFolder: TelegramExportFolder
  parentFolderId: FolderId | null
  selfParticipant: string
}

const supportedImageMimeTypes = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])

function collectPlainTextFromContent(content: ChatMessageContent): string {
  const parts: string[] = []

  function visit(nodes: Array<DocumentNode | TextNode>) {
    for (const node of nodes) {
      if (node.type === 'text') {
        parts.push((node as TextNode).text)
      } else if ((node as DocumentNode).content) {
        visit((node as DocumentNode).content ?? [])
      }
    }
  }

  visit(content)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

function replyContext(
  message: TelegramParsedMessage,
  messagesById: ReadonlyMap<string, TelegramParsedMessage>,
): ChatMessageContent {
  if (!message.replyToExternalId) {
    return []
  }

  const repliedMessage = messagesById.get(message.replyToExternalId)

  if (!repliedMessage) {
    return [
      {
        type: 'blockquote',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Reply to an earlier Telegram message' }],
          },
        ],
      },
    ]
  }

  const excerpt = collectPlainTextFromContent(repliedMessage.content).slice(0, 240)
  const label = excerpt
    ? `Reply to ${repliedMessage.senderName}: ${excerpt}`
    : `Reply to ${repliedMessage.senderName}'s attachment`

  return [
    {
      type: 'blockquote',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: label }] }],
    },
  ]
}

function attachmentFallback(path: string, reason: string): DocumentNode {
  return {
    type: 'callout',
    attrs: { tone: 'warning' },
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: `Telegram attachment ${path}: ${reason}` }],
      },
    ],
  }
}

function buildTelegramDocument(
  exportFolder: TelegramExportFolder,
  selfParticipant: string,
  importedImages: ReadonlyMap<
    string,
    { imageId: string; width: number; height: number }
  >,
  failedAttachments: ReadonlyMap<string, string>,
): NoteDocument {
  const messagesById = new Map(
    exportFolder.messages.map((message) => [message.externalId, message]),
  )

  const messages = exportFolder.messages.map((message) => {
    const content: ChatMessageContent = [
      ...replyContext(message, messagesById),
      ...message.content,
    ]

    for (const attachment of message.attachmentPaths) {
      const imported = importedImages.get(attachment.path)

      if (imported) {
        content.push({
          type: 'imageBlock',
          attrs: {
            imageId: imported.imageId,
            naturalHeight: imported.height,
            naturalWidth: imported.width,
          },
        })
      } else {
        content.push(
          attachmentFallback(
            attachment.path,
            failedAttachments.get(attachment.path) ?? 'pending import',
          ),
        )
      }
    }

    return {
      content,
      createdAt: message.createdAt,
      id: `telegram-${message.externalId}`,
      senderName: message.senderName,
      side: message.senderName === selfParticipant ? 'self' : 'other',
    } as const
  })

  return createChatDocumentFromMessages(messages)
}

function isImageFile(path: string, file: File): boolean {
  return (
    supportedImageMimeTypes.has(file.type.toLocaleLowerCase()) ||
    /\.(?:avif|gif|jpe?g|png|webp)$/i.test(path)
  )
}

export async function importTelegramChat(
  dependencies: TelegramImportDependencies,
  input: ImportTelegramChatInput,
): Promise<TelegramImportResult> {
  const { exportFolder, parentFolderId, selfParticipant } = input
  const participantNames = new Set(
    exportFolder.participants.map((participant) => participant.name),
  )

  if (!participantNames.has(selfParticipant)) {
    throw new Error('Choose which Telegram participant represents you.')
  }

  const failedAttachments = new Map<string, string>()

  for (const path of exportFolder.missingAttachmentPaths) {
    failedAttachments.set(path, 'file is missing from the selected folder')
  }

  const preliminaryDocument = buildTelegramDocument(
    exportFolder,
    selfParticipant,
    new Map(),
    failedAttachments,
  )

  dependencies.onProgress?.({
    completedAttachments: 0,
    phase: 'creating',
    totalAttachments: exportFolder.availableAttachmentCount,
  })

  const noteId = await dependencies.noteRepository.createNote({
    document: preliminaryDocument,
    parentFolderId,
    properties: { kind: 'chat', status: 'none', tags: ['telegram'] },
    title: exportFolder.title,
  })

  const importedImages = new Map<
    string,
    { imageId: string; width: number; height: number }
  >()
  const uniqueAttachmentPaths = [
    ...new Set(
      exportFolder.messages.flatMap((message) =>
        message.attachmentPaths.map((attachment) => attachment.path),
      ),
    ),
  ]
  let completedAttachments = 0

  for (const path of uniqueAttachmentPaths) {
    const file = exportFolder.filesByPath.get(path)

    if (!file) {
      continue
    }

    if (!isImageFile(path, file)) {
      failedAttachments.set(path, 'this file type is not supported yet')
      completedAttachments += 1
      continue
    }

    if (!dependencies.imageRepository) {
      failedAttachments.set(path, 'images are unavailable in this build')
      completedAttachments += 1
      continue
    }

    dependencies.onProgress?.({
      completedAttachments,
      phase: 'attachments',
      totalAttachments: exportFolder.availableAttachmentCount,
    })

    try {
      const imported = await dependencies.imageRepository.importImage({
        file,
        fileName: file.name || path.split('/').at(-1) || null,
        noteId,
      })
      importedImages.set(path, imported)
    } catch (error) {
      failedAttachments.set(
        path,
        error instanceof Error ? error.message : 'image import failed',
      )
    }

    completedAttachments += 1
  }

  dependencies.onProgress?.({
    completedAttachments,
    phase: 'saving',
    totalAttachments: exportFolder.availableAttachmentCount,
  })

  const finalDocument = buildTelegramDocument(
    exportFolder,
    selfParticipant,
    importedImages,
    failedAttachments,
  )

  try {
    await dependencies.noteRepository.updateNote(noteId, { document: finalDocument })
    await dependencies.imageRepository?.reconcileNoteImages(
      noteId,
      collectImageIdsFromDocument(finalDocument),
    )
  } catch (error) {
    try {
      await dependencies.imageRepository?.reconcileNoteImages(noteId, [])
    } catch {
      // The note still contains the fully readable preliminary import. Image
      // cleanup is best-effort and will be retried by the regular GC sweep.
    }

    const reason =
      error instanceof Error ? error.message : 'the final document save failed'

    importedImages.clear()

    for (const path of uniqueAttachmentPaths) {
      failedAttachments.set(
        path,
        `kept as a placeholder because the final attachment save failed: ${reason}`,
      )
    }

    dependencies.requestSync?.()

    return {
      importedAttachmentCount: 0,
      importedMessageCount: exportFolder.messages.length,
      noteId,
      skippedAttachmentCount: failedAttachments.size,
      warnings: [
        ...exportFolder.warnings,
        `The text conversation was saved, but attachments were kept as placeholders: ${reason}`,
        ...[...failedAttachments].map(([path, failure]) => `${path}: ${failure}`),
      ],
    }
  }

  dependencies.requestSync?.()

  const importWarnings = [
    ...exportFolder.warnings,
    ...[...failedAttachments].map(([path, reason]) => `${path}: ${reason}`),
  ]

  return {
    importedAttachmentCount: importedImages.size,
    importedMessageCount: exportFolder.messages.length,
    noteId,
    skippedAttachmentCount: failedAttachments.size,
    warnings: importWarnings,
  }
}
