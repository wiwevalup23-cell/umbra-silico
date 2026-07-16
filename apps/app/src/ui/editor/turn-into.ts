import type { Editor } from '@tiptap/core'

export type TurnIntoTarget =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'blockquote'
  | 'codeBlock'
  | 'callout'
  | 'toggle'

export function turnInto(editor: Editor, target: TurnIntoTarget): boolean {
  const chain = editor.chain().focus()

  switch (target) {
    case 'paragraph':
      return chain.setParagraph().run()
    case 'heading1':
      return chain.toggleHeading({ level: 1 }).run()
    case 'heading2':
      return chain.toggleHeading({ level: 2 }).run()
    case 'heading3':
      return chain.toggleHeading({ level: 3 }).run()
    case 'bulletList':
      return chain.toggleBulletList().run()
    case 'orderedList':
      return chain.toggleOrderedList().run()
    case 'taskList':
      return chain.toggleTaskList().run()
    case 'blockquote':
      return chain.toggleBlockquote().run()
    case 'codeBlock':
      return chain.setCodeBlock().run()
    case 'callout':
      return chain.toggleCallout().run()
    case 'toggle':
      return editor.isActive('details')
        ? chain.unsetDetails().run()
        : chain.setDetails().run()
  }
}
