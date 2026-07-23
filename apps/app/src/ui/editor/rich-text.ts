import Highlight from '@tiptap/extension-highlight'
import { TextStyleKit } from '@tiptap/extension-text-style'

export type EditorFontOption = {
  label: string
  value: string
  sampleClass?: string
}

export type EditorTextSizeOption = {
  label: string
  value: string
}

export type EditorHighlightOption = {
  color: string
  label: string
}

export const editorFontOptions: EditorFontOption[] = [
  { label: 'App default', value: '' },
  { label: 'Inter', sampleClass: 'sn-font-sample--inter', value: 'Inter Variable' },
  { label: 'Lora', sampleClass: 'sn-font-sample--lora', value: 'Lora Variable' },
  {
    label: 'Roboto Slab',
    sampleClass: 'sn-font-sample--roboto-slab',
    value: 'Roboto Slab Variable',
  },
  { label: 'Caveat', sampleClass: 'sn-font-sample--caveat', value: 'Caveat Variable' },
  { label: 'EB Garamond', value: 'SN EB Garamond' },
  { label: 'Cormorant', value: 'SN Cormorant Garamond' },
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
