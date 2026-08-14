import { getStyleProperty } from '@tiptap/core'
import Highlight from '@tiptap/extension-highlight'
import { FontFamily, FontSize, TextStyleKit } from '@tiptap/extension-text-style'
import type { MessageKey } from '@/shared/i18n'
import {
  readDocumentFontFamily,
  readDocumentFontSize,
  readHighlightColor,
  type DocumentFontFamily,
  type DocumentFontSize,
} from '@/shared/document-styles'

// Re-exported so a component reads one module for how a note is styled rather
// than reaching past this surface into the format itself.
export { readDocumentFontFamily, readDocumentFontSize, readHighlightColor }

// `''` is the "no explicit face" entry: a choice in the picker, never a value
// a document carries. Typing the rest against the palette is what stops a
// label being paired with a face the format would refuse.
export type EditorFontOption = {
  label: string
  value: DocumentFontFamily | ''
}

export type EditorTextSizeOption = {
  label: string
  value: DocumentFontSize | ''
}

export type EditorHighlightOption = {
  color: string
  labelKey: MessageKey
}

/**
 * Faces offered for the document body.
 *
 * Every entry has to earn the document slot. Inter is a superb UI face and so
 * belonged to the chrome, not here; Caveat and Roboto Slab were 2010s Google
 * defaults with neither a Mac nor a typographic lineage. What is left is one
 * school — Garamond text and display cuts, Lora as the softer transitional —
 * plus Monaco for people who write notes the way they write code.
 *
 * `value` is emitted verbatim as `font-family`, so keep the stacks unquoted:
 * quoted names come back HTML-encoded through serialization.
 */
export const editorFontOptions: EditorFontOption[] = [
  { label: 'Default', value: '' },
  { label: 'EB Garamond', value: 'SN EB Garamond' },
  { label: 'Cormorant', value: 'SN Cormorant Garamond' },
  { label: 'Lora', value: 'Lora Variable' },
  { label: 'Monaco', value: 'Monaco, Menlo, monospace' },
]


export const editorTextSizeOptions: EditorTextSizeOption[] = [
  { label: 'Auto', value: '' },
  { label: '13', value: '13px' },
  { label: '15', value: '15px' },
  { label: '17', value: '17px' },
  { label: '20', value: '20px' },
  { label: '24', value: '24px' },
  { label: '30', value: '30px' },
  { label: '36', value: '36px' },
]

export const editorHighlightOptions: EditorHighlightOption[] = [
  { color: '#f3df84', labelKey: 'editor.markerYellow' },
  { color: '#edc09d', labelKey: 'editor.markerOrange' },
  { color: '#e7b9b8', labelKey: 'editor.markerRose' },
  { color: '#bdd9bf', labelKey: 'editor.markerGreen' },
  { color: '#b9d8e8', labelKey: 'editor.markerBlue' },
  { color: '#d2c1df', labelKey: 'editor.markerViolet' },
]

/**
 * The marks refuse to render a value the format does not allow, which closes
 * the hole at the surface. `@/shared/document-styles` owns which values those
 * are, because the repository has to enforce the same set on documents that
 * never pass through a toolbar.
 */
// Guarding `parseHTML` as well as `renderHTML` keeps a hostile value from
// being stored in the first place, so pasted HTML cannot leave one sitting in
// the document waiting for a future renderer that forgets to check.
const GuardedFontFamily = FontFamily.extend({
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontFamily: {
            default: null,
            parseHTML: (element) =>
              readDocumentFontFamily(
                getStyleProperty(element, 'font-family') ?? element.style.fontFamily,
              ),
            renderHTML: (attributes: { fontFamily?: unknown }) => {
              const fontFamily = readDocumentFontFamily(attributes.fontFamily)

              return fontFamily ? { style: `font-family: ${fontFamily}` } : {}
            },
          },
        },
      },
    ]
  },
})

const GuardedFontSize = FontSize.extend({
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) =>
              readDocumentFontSize(
                getStyleProperty(element, 'font-size') ?? element.style.fontSize,
              ),
            renderHTML: (attributes: { fontSize?: unknown }) => {
              const fontSize = readDocumentFontSize(attributes.fontSize)

              return fontSize ? { style: `font-size: ${fontSize}` } : {}
            },
          },
        },
      },
    ]
  },
})

const GuardedHighlight = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: null,
        // `data-color` first: our own renderHTML always writes it, and it
        // survives the round trip as `#rrggbb` where reading the computed
        // style would hand back `rgb(...)` and fail the check.
        parseHTML: (element: HTMLElement) =>
          readHighlightColor(
            element.getAttribute('data-color') ??
              getStyleProperty(element, 'background-color') ??
              element.style.backgroundColor,
          ),
        renderHTML: (attributes: { color?: unknown }) => {
          const color = readHighlightColor(attributes.color)

          return color
            ? {
                'data-color': color,
                style: `background-color: ${color}; color: inherit`,
              }
            : {}
        },
      },
    }
  },
})

// TextStyleKit stores font family and size as attributes on a regular text
// mark, so both survive JSON persistence and continue to compose with bold,
// italic and links. Highlight intentionally uses the semantic <mark> node.
// The kit's own font extensions are switched off in favour of the guarded
// pair above.
export const NoteTextStyleExtensions = [
  TextStyleKit.configure({
    backgroundColor: false,
    color: false,
    fontFamily: false,
    fontSize: false,
    lineHeight: false,
  }),
  GuardedFontFamily,
  GuardedFontSize,
  GuardedHighlight.configure({ multicolor: true }),
]
