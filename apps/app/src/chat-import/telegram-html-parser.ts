import type {
  ChatMessageContent,
  DocumentNode,
  TextMark,
  TextNode,
} from '@/shared/contracts'
import type {
  TelegramAttachment,
  TelegramParsedMessage,
} from '@/shared/contracts'

const telegramDatePattern =
  /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+GMT([+-]\d{2}:\d{2})$/

function normalizeHumanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function parseTelegramDate(value: string): string | null {
  const match = telegramDatePattern.exec(normalizeHumanText(value))

  if (!match) {
    return null
  }

  const [, day, month, year, hour, minute, second, offset] = match
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`)

  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function sanitizeRelativePath(value: string): string | null {
  let decoded: string

  try {
    decoded = decodeURIComponent(value)
  } catch {
    decoded = value
  }

  const segments = decoded
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment && segment !== '.')

  if (segments.length === 0 || segments.some((segment) => segment === '..')) {
    return null
  }

  return segments.join('/')
}

function marksForElement(element: Element, inherited: TextMark[]): TextMark[] {
  const tagName = element.tagName.toLocaleLowerCase()

  switch (tagName) {
    case 'a': {
      const href = element.getAttribute('href')
      const safeHref =
        href && /^(?:https?:|mailto:|tel:|tg:)/i.test(href) ? href : null
      return safeHref
        ? [...inherited, { type: 'link', attrs: { href: safeHref } }]
        : inherited
    }
    case 'b':
    case 'strong':
      return [...inherited, { type: 'bold' }]
    case 'i':
    case 'em':
      return [...inherited, { type: 'italic' }]
    case 'code':
      return [...inherited, { type: 'code' }]
    case 's':
    case 'strike':
      return [...inherited, { type: 'strike' }]
    case 'u':
      return [...inherited, { type: 'underline' }]
    default:
      return inherited
  }
}

function collectInlineNodes(
  node: Node,
  inheritedMarks: TextMark[],
  output: Array<TextNode | DocumentNode>,
): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.replace(/\s+/g, ' ') ?? ''

    if (text) {
      output.push({
        type: 'text',
        text,
        ...(inheritedMarks.length > 0 ? { marks: inheritedMarks } : {}),
      })
    }

    return
  }

  if (!(node instanceof Element)) {
    return
  }

  if (node.tagName.toLocaleLowerCase() === 'br') {
    output.push({ type: 'hardBreak' })
    return
  }

  const marks = marksForElement(node, inheritedMarks)

  for (const child of node.childNodes) {
    collectInlineNodes(child, marks, output)
  }
}

function trimInlineBoundary(nodes: Array<TextNode | DocumentNode>): void {
  const first = nodes[0]
  const last = nodes[nodes.length - 1]

  if (first?.type === 'text') {
    const textNode = first as TextNode
    textNode.text = textNode.text.trimStart()
  }

  if (last?.type === 'text') {
    const textNode = last as TextNode
    textNode.text = textNode.text.trimEnd()
  }

  while (nodes[0]?.type === 'text' && !(nodes[0] as TextNode).text) {
    nodes.shift()
  }

  while (
    nodes[nodes.length - 1]?.type === 'text' &&
    !(nodes[nodes.length - 1] as TextNode).text
  ) {
    nodes.pop()
  }
}

function parseMessageText(element: Element | null): ChatMessageContent {
  if (!element) {
    return []
  }

  const inlineNodes: Array<TextNode | DocumentNode> = []

  for (const child of element.childNodes) {
    collectInlineNodes(child, [], inlineNodes)
  }

  trimInlineBoundary(inlineNodes)
  return inlineNodes.length > 0 ? [{ type: 'paragraph', content: inlineNodes }] : []
}

function readDirectChild(parent: Element, selector: string): Element | null {
  return parent.querySelector(`:scope > ${selector}`)
}

function readSenderName(body: Element, inheritedSender: string | null): string | null {
  const senderElement = readDirectChild(body, '.from_name')

  if (!senderElement) {
    return inheritedSender
  }

  const senderText = [...senderElement.childNodes]
    .filter((node) => !(node instanceof Element && node.classList.contains('date')))
    .map((node) => node.textContent ?? '')
    .join(' ')

  return normalizeHumanText(senderText) || inheritedSender
}

function readAttachments(body: Element): TelegramAttachment[] {
  const attachments: TelegramAttachment[] = []

  for (const anchor of body.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = anchor.getAttribute('href')

    if (
      !href ||
      href.startsWith('#') ||
      /^[a-z][a-z\d+.-]*:/i.test(href)
    ) {
      continue
    }

    const path = sanitizeRelativePath(href)

    if (!path) {
      continue
    }

    const kind = anchor.classList.contains('photo_wrap')
      ? 'image'
      : anchor.classList.contains('sticker_wrap')
        ? 'sticker'
        : 'file'

    attachments.push({ kind, path })
  }

  return attachments
}

export type TelegramHtmlPage = {
  lastSender: string | null
  messages: TelegramParsedMessage[]
  title: string
  warnings: string[]
}

export function parseTelegramHtmlPage(
  html: string,
  sourceName: string,
  initialSender: string | null = null,
): TelegramHtmlPage {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const parserError = document.querySelector('parsererror')

  if (parserError) {
    throw new Error(`${sourceName} is not valid HTML.`)
  }

  const title =
    normalizeHumanText(document.querySelector('.page_header .text.bold')?.textContent ?? '') ||
    'Telegram chat'
  const messages: TelegramParsedMessage[] = []
  const warnings: string[] = []
  let currentSender: string | null = initialSender

  for (const messageElement of document.querySelectorAll<HTMLElement>(
    '.history > .message.default',
  )) {
    const body = readDirectChild(messageElement, '.body')

    if (!body) {
      warnings.push(`${sourceName}: ${messageElement.id || 'message'} has no body.`)
      continue
    }

    currentSender = readSenderName(body, currentSender)

    if (!currentSender) {
      warnings.push(
        `${sourceName}: ${messageElement.id || 'message'} has no recoverable sender.`,
      )
      continue
    }

    const dateTitle = readDirectChild(body, '.date.details')?.getAttribute('title') ?? ''
    const createdAt = parseTelegramDate(dateTitle)

    if (!createdAt) {
      warnings.push(
        `${sourceName}: ${messageElement.id || 'message'} has an invalid timestamp.`,
      )
      continue
    }

    const externalId = messageElement.id.replace(/^message/, '') || `${messages.length + 1}`
    const directText = parseMessageText(readDirectChild(body, '.text'))
    const forwardedBody = readDirectChild(body, '.forwarded.body')
    const forwardedFrom = forwardedBody
      ? readSenderName(forwardedBody, null)
      : null
    const forwardedText = forwardedBody
      ? parseMessageText(readDirectChild(forwardedBody, '.text'))
      : []
    const content: ChatMessageContent = []

    if (forwardedFrom) {
      content.push({
        type: 'blockquote',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: `Forwarded from ${forwardedFrom}` }],
          },
        ],
      })
    }

    content.push(...directText, ...forwardedText)

    const replyHref = readDirectChild(body, '.reply_to')?.querySelector('a')?.getAttribute('href')
    const replyToExternalId = replyHref?.startsWith('#go_to_message')
      ? replyHref.slice('#go_to_message'.length)
      : null
    const attachmentPaths = readAttachments(body)

    if (content.length === 0 && attachmentPaths.length === 0) {
      warnings.push(
        `${sourceName}: ${messageElement.id || 'message'} has no importable content.`,
      )
      continue
    }

    messages.push({
      attachmentPaths,
      content,
      createdAt,
      externalId,
      forwardedFrom,
      replyToExternalId,
      senderName: currentSender,
    })
  }

  if (messages.length === 0) {
    throw new Error(`${sourceName} does not contain Telegram chat messages.`)
  }

  return { lastSender: currentSender, messages, title, warnings }
}
