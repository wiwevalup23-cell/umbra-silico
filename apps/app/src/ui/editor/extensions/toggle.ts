import {
  Details,
  DetailsContent,
  DetailsSummary,
} from '@tiptap/extension-details'

export const ToggleExtensions = [
  Details.configure({
    persist: true,
  }),
  DetailsSummary,
  DetailsContent,
]
