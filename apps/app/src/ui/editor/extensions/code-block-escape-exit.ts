import { Extension } from '@tiptap/core'

/**
 * `codeBlock`'s own exits (Tab-indentation stays inside it, Mod-Enter and an
 * ArrowDown at the last line both call `exitCode` already, via core's base
 * keymap and the extension's own shortcuts) still leave no plain, position-
 * independent way out. Without one, a code block is a keyboard trap — WCAG
 * 2.1.2 — so Escape gets the same `exitCode` exit as Mod-Enter.
 */
export const CodeBlockEscapeExit = Extension.create({
  name: 'codeBlockEscapeExit',

  addKeyboardShortcuts() {
    return {
      Escape: () => {
        if (this.editor.state.selection.$from.parent.type.name !== 'codeBlock') {
          return false
        }

        return this.editor.commands.exitCode()
      },
    }
  },
})
