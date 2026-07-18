import { mergeAttributes, Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ImageBlockView } from './ImageBlockView'

export type ImageAlign = 'left' | 'center' | 'right' | 'full'

export type ImageBlockAttrs = {
  imageId: string
  caption: string
  align: ImageAlign
  widthPct: number
  naturalWidth: number | null
  naturalHeight: number | null
}

const imageAligns = new Set<ImageAlign>(['left', 'center', 'right', 'full'])
const widthPctMin = 10
const widthPctMax = 100

export function normalizeImageAlign(value: unknown): ImageAlign {
  return imageAligns.has(value as ImageAlign) ? (value as ImageAlign) : 'center'
}

export function normalizeImageWidthPct(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(parsed)) {
    return widthPctMax
  }

  return Math.min(widthPctMax, Math.max(widthPctMin, Math.round(parsed)))
}

function parseDimension(value: string | null): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageBlock: {
      insertImageBlock: (
        attrs: Partial<ImageBlockAttrs> & { imageId: string },
      ) => ReturnType
      insertImageBlockAt: (
        position: number,
        attrs: Partial<ImageBlockAttrs> & { imageId: string },
      ) => ReturnType
    }
  }
}

// The document stores only the stable imageId plus presentation attrs; the
// binary payload lives in the images store and is resolved to an object URL
// at render time.
export const ImageBlock = Node.create({
  name: 'imageBlock',

  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      imageId: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-image-id') ?? '',
        renderHTML: (attributes: ImageBlockAttrs) => ({
          'data-image-id': attributes.imageId,
        }),
      },
      caption: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-caption') ?? '',
        renderHTML: (attributes: ImageBlockAttrs) => ({
          'data-caption': attributes.caption,
        }),
      },
      align: {
        default: 'center',
        parseHTML: (element) => normalizeImageAlign(element.getAttribute('data-align')),
        renderHTML: (attributes: ImageBlockAttrs) => ({
          'data-align': normalizeImageAlign(attributes.align),
        }),
      },
      widthPct: {
        default: 100,
        parseHTML: (element) =>
          normalizeImageWidthPct(element.getAttribute('data-width-pct')),
        renderHTML: (attributes: ImageBlockAttrs) => ({
          'data-width-pct': String(normalizeImageWidthPct(attributes.widthPct)),
        }),
      },
      naturalWidth: {
        default: null,
        parseHTML: (element) => parseDimension(element.getAttribute('data-natural-width')),
        renderHTML: (attributes: ImageBlockAttrs) =>
          attributes.naturalWidth
            ? { 'data-natural-width': String(attributes.naturalWidth) }
            : {},
      },
      naturalHeight: {
        default: null,
        parseHTML: (element) => parseDimension(element.getAttribute('data-natural-height')),
        renderHTML: (attributes: ImageBlockAttrs) =>
          attributes.naturalHeight
            ? { 'data-natural-height': String(attributes.naturalHeight) }
            : {},
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'figure[data-image-block]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes(HTMLAttributes, { 'data-image-block': '' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageBlockView)
  },

  addCommands() {
    return {
      insertImageBlock:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
      insertImageBlockAt:
        (position, attrs) =>
        ({ commands }) =>
          commands.insertContentAt(position, { type: this.name, attrs }),
    }
  },
})
