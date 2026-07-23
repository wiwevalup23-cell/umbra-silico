import type { ChatMessageContent, DocumentNode, TextNode } from '@/shared/contracts'

type AnyNode = DocumentNode | TextNode

// Node types the composer itself can produce. Messages made of these can be
// re-opened in the composer for editing without the schema dropping content.
const composerEditableNodeTypes = new Set([
  'blockquote',
  'bulletList',
  'codeBlock',
  'hardBreak',
  'inlineMath',
  'listItem',
  'orderedList',
  'paragraph',
  'blockMath',
  'text',
])

export function isComposerEditableContent(content: ChatMessageContent): boolean {
  return content.every(isComposerEditableNode)
}

function isComposerEditableNode(node: AnyNode): boolean {
  if (!composerEditableNodeTypes.has(node.type)) {
    return false
  }

  const children = (node as DocumentNode).content

  return !Array.isArray(children) || children.every(isComposerEditableNode)
}

export function collectPlainText(content: ChatMessageContent): string {
  const parts: string[] = []
  collectPlainTextFromNodes(content, parts)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

function collectPlainTextFromNodes(nodes: AnyNode[], parts: string[]): void {
  for (const node of nodes) {
    if (node.type === 'text') {
      parts.push((node as TextNode).text)
      continue
    }

    if (node.type === 'inlineMath' || node.type === 'blockMath') {
      const latex = (node as DocumentNode).attrs?.latex

      if (typeof latex === 'string' && latex.trim()) {
        parts.push(latex.trim())
      }

      continue
    }

    const children = (node as DocumentNode).content

    if (Array.isArray(children)) {
      collectPlainTextFromNodes(children, parts)
    }
  }
}
