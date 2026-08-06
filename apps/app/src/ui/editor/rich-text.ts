import Highlight from '@tiptap/extension-highlight'
import { TextStyleKit } from '@tiptap/extension-text-style'

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

// TextStyleKit stores font family and size as attributes on a regular text
// mark, so both survive JSON persistence and continue to compose with bold,
// italic and links. Highlight intentionally uses the semantic <mark> node.
export const NoteTextStyleExtensions = [
  TextStyleKit.configure({
    backgroundColor: false,
    color: false,
    lineHeight: false,
  }),
  Highlight.configure({ multicolor: true }),
]
