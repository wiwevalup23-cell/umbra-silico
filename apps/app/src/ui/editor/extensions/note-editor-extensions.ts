import type { Extensions } from '@tiptap/core'
import { Mathematics } from '@tiptap/extension-mathematics'
import { TableKit } from '@tiptap/extension-table'
import StarterKit from '@tiptap/starter-kit'
import { NoteTextStyleExtensions } from '@/ui/document'
import { BlockLayout } from './block-layout'
import { Callout } from './callout'
import { CodeBlockEscapeExit } from './code-block-escape-exit'
import { ImageBlock } from './image-block'
import { PageLayout } from './page-layout'
import { TaskListExtensions } from './task-list'
import { ToggleExtensions } from './toggle'

export type MathKind = 'inline' | 'block'

export type NoteEditorExtensionOptions = {
  /** Opens the equation editor for the formula already in the document. */
  onEditMath(kind: MathKind, latex: string, pos: number): void
}

/**
 * The full node/mark vocabulary of a note document, in one place.
 *
 * Anything that changes what a document *can contain* belongs here rather than
 * in the component that mounts the editor: the same list has to be reachable
 * from a headless parse (backups, search, print) without dragging React in.
 */
export function createNoteEditorExtensions({
  onEditMath,
}: NoteEditorExtensionOptions): Extensions {
  return [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3],
      },
      codeBlock: {
        enableTabIndentation: true,
        tabSize: 2,
      },
    }),
    CodeBlockEscapeExit,
    TableKit.configure({
      table: {
        allowTableNodeSelection: true,
        cellMinWidth: 92,
        handleWidth: 6,
        lastColumnResizable: false,
        resizable: true,
      },
    }),
    ...TaskListExtensions,
    ...ToggleExtensions,
    Callout,
    ImageBlock,
    ...NoteTextStyleExtensions,
    Mathematics.configure({
      blockOptions: {
        onClick(node, pos) {
          onEditMath('block', typeof node.attrs.latex === 'string' ? node.attrs.latex : '', pos)
        },
      },
      inlineOptions: {
        onClick(node, pos) {
          onEditMath('inline', typeof node.attrs.latex === 'string' ? node.attrs.latex : '', pos)
        },
      },
      katexOptions: {
        output: 'htmlAndMathml',
        strict: 'warn',
        throwOnError: false,
      },
    }),
    BlockLayout,
    PageLayout,
  ]
}
