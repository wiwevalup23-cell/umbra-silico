import type {
  DocumentNode,
  LocalFolder,
  NoteDetail,
  NoteDocument,
  TextNode,
} from '@/shared/contracts'

function isTextNode(node: DocumentNode | TextNode): node is TextNode {
  return node.type === 'text'
}

function applyMarks(text: string, node: TextNode): string {
  let output = text

  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case 'bold':
      case 'strong':
        output = `**${output}**`
        break
      case 'italic':
      case 'em':
        output = `*${output}*`
        break
      case 'strike':
        output = `~~${output}~~`
        break
      case 'code':
        output = `\`${output}\``
        break
      case 'link': {
        const href = mark.attrs?.href
        output = typeof href === 'string' ? `[${output}](${href})` : output
        break
      }
      default:
        break
    }
  }

  return output
}

function inlineText(node: DocumentNode): string {
  return (node.content ?? [])
    .map((child) => (isTextNode(child) ? applyMarks(child.text, child) : inlineText(child)))
    .join('')
}

function renderNode(node: DocumentNode, depth: number): string[] {
  switch (node.type) {
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)))
      return [`${'#'.repeat(level)} ${inlineText(node)}`]
    }
    case 'codeBlock':
      return ['```', inlineText(node), '```']
    case 'blockquote':
      return (node.content ?? [])
        .filter((child): child is DocumentNode => !isTextNode(child))
        .flatMap((child) => renderNode(child, depth).map((line) => `> ${line}`))
    case 'bulletList':
    case 'orderedList':
      return (node.content ?? [])
        .filter((child): child is DocumentNode => !isTextNode(child))
        .flatMap((child, index) => {
          const bullet = node.type === 'orderedList' ? `${index + 1}.` : '-'
          const indent = '  '.repeat(depth)
          const [first = '', ...rest] = renderNode(child, depth + 1)
          return [`${indent}${bullet} ${first}`, ...rest]
        })
    case 'taskList':
      return (node.content ?? [])
        .filter((child): child is DocumentNode => !isTextNode(child))
        .map((child) => {
          const done = child.attrs?.checked === true
          return `${'  '.repeat(depth)}- [${done ? 'x' : ' '}] ${inlineText(child)}`
        })
    case 'listItem':
    case 'taskItem':
      return (node.content ?? [])
        .filter((child): child is DocumentNode => !isTextNode(child))
        .flatMap((child) => renderNode(child, depth))
    case 'horizontalRule':
      return ['---']
    case 'imageBlock':
      return [`![image](umbra-image:${node.attrs?.imageId ?? 'unknown'})`]
    case 'chatLog':
      return (node.content ?? [])
        .filter((child): child is DocumentNode => !isTextNode(child))
        .flatMap((message) => {
          const who = message.attrs?.senderName ?? (message.attrs?.side === 'other' ? 'Them' : 'Me')
          const when = message.attrs?.createdAt
          const body = (message.content ?? [])
            .filter((child): child is DocumentNode => !isTextNode(child))
            .flatMap((child) => renderNode(child, depth))
            .join(' ')
          return [`**${String(who)}**${when ? ` · ${String(when)}` : ''}: ${body}`]
        })
    default:
      return [inlineText(node)]
  }
}

export function documentToMarkdown(document: NoteDocument): string {
  return (document.content.content ?? [])
    .filter((node): node is DocumentNode => !isTextNode(node))
    .flatMap((node) => renderNode(node, 0))
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Renders the whole library as one readable Markdown document.
 *
 * This is the human-facing export, not a backup: it deliberately cannot
 * represent a locked note, which is listed by position only so the reader can
 * see that something encrypted lives there.
 */
export function libraryToMarkdown(
  notes: readonly NoteDetail[],
  folders: readonly LocalFolder[],
  createdAt: string,
): string {
  const folderNames = new Map(folders.map((folder) => [folder.id, folder.name]))
  const live = notes.filter((note) => note.deletedAt === null)
  const sections = live.map((note) => {
    const folder = note.parentFolderId
      ? folderNames.get(note.parentFolderId) ?? 'Unknown folder'
      : 'All notes'
    const header = [
      `## ${note.isLocked ? 'Locked note' : note.title}`,
      '',
      `*${folder} · updated ${note.updatedAt}*`,
      '',
    ].join('\n')

    return note.isLocked
      ? `${header}\n_This note is encrypted. Unlock it in Umbra Silico to export its text._`
      : `${header}\n${documentToMarkdown(note.document)}`
  })

  return [
    '# Umbra Silico export',
    '',
    `*${live.length} note(s) · exported ${createdAt}*`,
    '',
    ...sections,
    '',
  ].join('\n')
}

export function markdownFileName(createdAt: string): string {
  const date = new Date(createdAt)
  const stamp = Number.isNaN(date.getTime())
    ? 'unknown'
    : date.toISOString().slice(0, 10)

  return `umbra-silico-notes-${stamp}.md`
}
