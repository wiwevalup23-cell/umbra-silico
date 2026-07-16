import { mergeAttributes, Node } from '@tiptap/core'

export type CalloutTone = 'info' | 'warn' | 'success' | 'neutral'

export type CalloutAttrs = {
  emoji?: string
  tone?: CalloutTone
}

const calloutTones = new Set<CalloutTone>(['info', 'warn', 'success', 'neutral'])

function normalizeTone(value: unknown): CalloutTone {
  return calloutTones.has(value as CalloutTone) ? (value as CalloutTone) : 'info'
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (attrs?: CalloutAttrs) => ReturnType
      toggleCallout: (attrs?: CalloutAttrs) => ReturnType
    }
  }
}

export const Callout = Node.create({
  name: 'callout',

  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      emoji: {
        default: '💡',
        parseHTML: (element) => element.getAttribute('data-emoji') || '💡',
        renderHTML: (attributes: CalloutAttrs) => ({
          'data-emoji': attributes.emoji || '💡',
        }),
      },
      tone: {
        default: 'info',
        parseHTML: (element) => normalizeTone(element.getAttribute('data-tone')),
        renderHTML: (attributes: CalloutAttrs) => ({
          'data-tone': normalizeTone(attributes.tone),
        }),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-callout]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-callout': '',
        'data-tone': normalizeTone(HTMLAttributes.tone),
      }),
      0,
    ]
  },

  addCommands() {
    return {
      setCallout:
        (attrs = {}) =>
        ({ commands }) =>
          commands.wrapIn(this.name, {
            emoji: attrs.emoji || '💡',
            tone: normalizeTone(attrs.tone),
          }),
      toggleCallout:
        (attrs = {}) =>
        ({ commands }) =>
          commands.toggleWrap(this.name, {
            emoji: attrs.emoji || '💡',
            tone: normalizeTone(attrs.tone),
          }),
    }
  },
})
