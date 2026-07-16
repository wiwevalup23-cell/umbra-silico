import type { NotePropertyStatus } from '@/shared/contracts'

export type PropertyStatusPresentation = {
  label: string
  value: NotePropertyStatus
}

export const propertyStatusOptions: readonly PropertyStatusPresentation[] = [
  { label: 'No status', value: 'none' },
  { label: 'Idea', value: 'idea' },
  { label: 'In progress', value: 'active' },
  { label: 'Done', value: 'done' },
]

export function getPropertyStatusPresentation(
  value: NotePropertyStatus | undefined,
): PropertyStatusPresentation {
  return propertyStatusOptions.find((option) => option.value === value)
    ?? propertyStatusOptions[0]
}
