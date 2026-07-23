import {
  customNotePropertyStatusPrefix,
  type NotePropertyStatus,
} from '@/shared/contracts'

export type PropertyStatusPresentation = {
  icon: string
  label: string
  value: NotePropertyStatus
}

export const propertyStatusOptions: readonly PropertyStatusPresentation[] = [
  { icon: 'none', label: 'No status', value: 'none' },
  { icon: 'idea', label: 'Idea', value: 'idea' },
  { icon: 'inProgress', label: 'In progress', value: 'active' },
  { icon: 'done', label: 'Done', value: 'done' },
]

export const customStatusIconOptions = [
  { icon: 'waiting', label: 'Waiting' },
  { icon: 'pause', label: 'Pause' },
  { icon: 'review', label: 'Review' },
  { icon: 'archive', label: 'Archive' },
  { icon: 'block', label: 'Block' },
  { icon: 'someday', label: 'Someday' },
  { icon: 'focus', label: 'Focus' },
  { icon: 'important', label: 'Important' },
  { icon: 'repeat', label: 'Repeat' },
  { icon: 'spiral', label: 'Spiral' },
  { icon: 'connection', label: 'Connection' },
  { icon: 'wave', label: 'Wave' },
  { icon: 'arrow', label: 'Arrow' },
  { icon: 'key', label: 'Key' },
  { icon: 'infinity', label: 'Infinity' },
  { icon: 'windRose', label: 'Wind rose' },
] as const

export function createCustomPropertyStatus(label: string, icon: string): NotePropertyStatus {
  const normalizedLabel = label.trim().replace(/\s+/g, ' ').slice(0, 32)
  return `${customNotePropertyStatusPrefix}${encodeURIComponent(icon)}:${encodeURIComponent(normalizedLabel)}`
}

export function parseCustomPropertyStatus(
  value: NotePropertyStatus | undefined,
): PropertyStatusPresentation | null {
  if (!value?.startsWith(customNotePropertyStatusPrefix)) return null

  const encoded = value.slice(customNotePropertyStatusPrefix.length)
  const separator = encoded.indexOf(':')
  if (separator === -1) return null

  try {
    const icon = decodeURIComponent(encoded.slice(0, separator))
    const label = decodeURIComponent(encoded.slice(separator + 1)).trim()
    if (!icon || !label) return null

    return { icon, label, value }
  } catch {
    return null
  }
}

export function getPropertyStatusPresentation(
  value: NotePropertyStatus | undefined,
): PropertyStatusPresentation {
  return propertyStatusOptions.find((option) => option.value === value)
    ?? parseCustomPropertyStatus(value)
    ?? propertyStatusOptions[0]
}
