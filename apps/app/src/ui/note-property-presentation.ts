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
  { icon: 'idle', label: 'No status', value: 'none' },
  { icon: 'beacon', label: 'Idea', value: 'idea' },
  { icon: 'orbit', label: 'In progress', value: 'active' },
  { icon: 'seal', label: 'Done', value: 'done' },
]

export const customStatusIconOptions = [
  { icon: 'beacon', label: 'Beacon' },
  { icon: 'orbit', label: 'Orbit' },
  { icon: 'eclipse', label: 'Eclipse' },
  { icon: 'ripple', label: 'Ripple' },
  { icon: 'cipher', label: 'Cipher' },
  { icon: 'flag', label: 'Flag' },
  { icon: 'loop', label: 'Loop' },
  { icon: 'vault', label: 'Vault' },
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
