import { getStyleProperty } from '@tiptap/core'
import Highlight from '@tiptap/extension-highlight'
import { FontFamily, FontSize, TextStyleKit } from '@tiptap/extension-text-style'

export type EditorFontOption = {
  label: string
  value: string
}

export type EditorTextSizeOption = {
  label: string
  value: string
}

export type EditorHighlightOption = {
  color: string
  label: string
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
  { color: '#f3df84', label: 'Yellow marker' },
  { color: '#edc09d', label: 'Orange marker' },
  { color: '#e7b9b8', label: 'Rose marker' },
  { color: '#bdd9bf', label: 'Green marker' },
  { color: '#b9d8e8', label: 'Blue marker' },
  { color: '#d2c1df', label: 'Violet marker' },
]

/**
 * The three document attributes that reach a `style` attribute verbatim.
 *
 * Upstream renders them by interpolation — `style: font-family: ${value}` —
 * and a note document is not trusted input: `attrs` is free-form JSON, so a
 * backup, a Telegram import or a synced payload can carry
 * `serif; background: url(https://…)` and turn a "Local only" note into a
 * beacon that reports the reader's address and reading time on open. CSS
 * cannot run script, which is why this is a privacy hole rather than an XSS,
 * and for this product that is the worse of the two.
 *
 * A value that is not on the palette is dropped rather than escaped. Escaping
 * invites a search for the sequence that survives it; a closed set does not.
 * The retired-font migration in `@/shared/document-fonts` already rewrites
 * older documents onto exactly this set before the editor ever sees them.
 */
/**
 * Compares font stacks the way CSS means them rather than by spelling.
 *
 * The CSSOM quotes multi-word family names the moment a stack touches a real
 * `style` property, so the value that comes back from a copy-paste round trip
 * is `"SN EB Garamond"` where the palette holds `SN EB Garamond`. Matching on
 * the raw string would drop the face on every paste. Quotes and spacing are
 * the only things normalized away — nothing that could reintroduce a `;`.
 */
function normalizeFontStack(value: string): string {
  return value
    .split(',')
    .map((family) => family.trim().replace(/^(["'])(.*)\1$/, '$2').trim())
    .filter(Boolean)
    .join(', ')
}

const fontFamiliesByStack = new Map(
  editorFontOptions
    .filter((option) => option.value)
    .map((option) => [normalizeFontStack(option.value), option.value]),
)
const supportedFontSizes = new Set(
  editorTextSizeOptions.map((option) => option.value).filter(Boolean),
)

/**
 * Returns the palette's own spelling, never the caller's. Echoing the input
 * back — even after it passed the check — would let an unexpected but
 * equivalent spelling reach the style attribute.
 */
export function readDocumentFontFamily(value: unknown): string | null {
  return typeof value === 'string'
    ? fontFamiliesByStack.get(normalizeFontStack(value)) ?? null
    : null
}

export function readDocumentFontSize(value: unknown): string | null {
  const fontSize = typeof value === 'string' ? value.trim() : null

  return fontSize && supportedFontSizes.has(fontSize) ? fontSize : null
}

/**
 * Any six-digit hex, not just the six on the palette: the shape alone rules
 * out a semicolon or a `url(`, and a highlight the user has already applied
 * should not vanish because the palette was restyled.
 */
export function readHighlightColor(value: unknown): string | null {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : null
}

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
