import { parseTelegramHtmlPage } from '@/chat-import/telegram-html-parser'
import type {
  TelegramExportFolder,
  TelegramParsedMessage,
  TelegramParticipant,
} from '@/shared/contracts'

const maximumHtmlBytes = 64 * 1024 * 1024
const maximumMessageCount = 250_000

function naturalCompare(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
}

function normalizeFilePath(file: File): string {
  return (file.webkitRelativePath || file.name).replace(/\\/g, '/').replace(/^\/+/, '')
}

function stripCommonRoot(paths: string[]): { paths: string[]; rootName: string } {
  const firstSegments = paths.map((path) => path.split('/')[0] ?? '')
  const rootName =
    firstSegments.length > 0 && firstSegments.every((segment) => segment === firstSegments[0])
      ? firstSegments[0]
      : 'Telegram export'
  const canStrip = paths.every((path) => path.includes('/')) && rootName !== 'Telegram export'

  return {
    rootName,
    paths: canStrip ? paths.map((path) => path.split('/').slice(1).join('/')) : paths,
  }
}

function suggestSelfParticipant(
  title: string,
  participants: TelegramParticipant[],
): string | null {
  if (participants.length === 2) {
    const participantDifferentFromTitle = participants.find(
      (participant) => participant.name !== title,
    )

    if (participantDifferentFromTitle) {
      return participantDifferentFromTitle.name
    }
  }

  return null
}

export async function readTelegramExportFolder(
  selectedFiles: File[],
): Promise<TelegramExportFolder> {
  if (selectedFiles.length === 0) {
    throw new Error('Choose a Telegram export folder.')
  }

  const rawPaths = selectedFiles.map(normalizeFilePath)
  const { paths, rootName } = stripCommonRoot(rawPaths)
  const filesByPath = new Map<string, File>()

  selectedFiles.forEach((file, index) => {
    const path = paths[index]

    if (path) {
      filesByPath.set(path, file)
    }
  })

  const sourceFiles = [...filesByPath.keys()]
    .filter((path) => /(^|\/)messages\d*\.html$/i.test(path))
    .sort(naturalCompare)

  if (sourceFiles.length === 0) {
    throw new Error(
      'No messages.html was found. In Telegram Desktop export this chat in HTML format, then choose the exported folder.',
    )
  }

  const sourceDirectories = new Set(
    sourceFiles.map((path) => path.split('/').slice(0, -1).join('/')),
  )

  if (sourceDirectories.size > 1) {
    throw new Error(
      'The selected folder contains multiple Telegram chat exports. Choose the folder for one chat only.',
    )
  }

  const oversizedSource = sourceFiles.find(
    (path) => (filesByPath.get(path)?.size ?? 0) > maximumHtmlBytes,
  )

  if (oversizedSource) {
    throw new Error(`${oversizedSource} is larger than the supported 64 MB page size.`)
  }

  const messages: TelegramParsedMessage[] = []
  const warnings: string[] = []
  const titles = new Set<string>()
  const seenMessageIds = new Set<string>()
  let previousSender: string | null = null

  for (const path of sourceFiles) {
    const file = filesByPath.get(path)

    if (!file) {
      continue
    }

    const page = parseTelegramHtmlPage(await file.text(), path, previousSender)
    previousSender = page.lastSender
    titles.add(page.title)
    warnings.push(...page.warnings)

    for (const message of page.messages) {
      if (seenMessageIds.has(message.externalId)) {
        warnings.push(`${path}: duplicate Telegram message ${message.externalId} was skipped.`)
        continue
      }

      seenMessageIds.add(message.externalId)
      messages.push(message)

      if (messages.length > maximumMessageCount) {
        throw new Error(
          `This export contains more than ${maximumMessageCount.toLocaleString()} messages.`,
        )
      }
    }
  }

  const participantCounts = new Map<string, number>()

  for (const message of messages) {
    participantCounts.set(
      message.senderName,
      (participantCounts.get(message.senderName) ?? 0) + 1,
    )
  }

  const participants = [...participantCounts.entries()]
    .map(([name, messageCount]) => ({ messageCount, name }))
    .sort((left, right) => right.messageCount - left.messageCount)
  const attachmentPaths = messages.flatMap((message) =>
    message.attachmentPaths.map((attachment) => attachment.path),
  )
  const uniqueAttachmentPaths = [...new Set(attachmentPaths)]
  const missingAttachmentPaths = uniqueAttachmentPaths.filter(
    (path) => !filesByPath.has(path),
  )
  const title = [...titles][0] ?? rootName

  if (titles.size > 1) {
    warnings.push(
      `Export pages use different chat titles: ${[...titles].join(', ')}. The first title will be used.`,
    )
  }

  if (missingAttachmentPaths.length > 0) {
    warnings.push(
      `${missingAttachmentPaths.length} attachment files referenced by Telegram are missing from the selected folder.`,
    )
  }

  return {
    attachmentCount: uniqueAttachmentPaths.length,
    availableAttachmentCount:
      uniqueAttachmentPaths.length - missingAttachmentPaths.length,
    filesByPath,
    messages,
    missingAttachmentPaths,
    participants,
    rootName,
    sourceFiles,
    suggestedSelfParticipant: suggestSelfParticipant(title, participants),
    title,
    warnings,
  }
}
