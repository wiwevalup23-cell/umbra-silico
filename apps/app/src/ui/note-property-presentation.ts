import {
  customNotePropertyStatusPrefix,
  type NotePropertyStatus,
} from '@/shared/contracts'
import type { MessageKey } from '@/shared/i18n'

/**
 * Built-in statuses carry a `labelKey` and are translated; a status the user
 * created carries the `label` they typed and is left exactly as written.
 */
export type PropertyStatusPresentation = {
  icon: string
  label?: string
  labelKey?: MessageKey
  value: NotePropertyStatus
}

export const propertyStatusOptions: readonly PropertyStatusPresentation[] = [
  { icon: 'none', labelKey: 'status.none', value: 'none' },
  { icon: 'idea', labelKey: 'status.idea', value: 'idea' },
  { icon: 'inProgress', labelKey: 'status.active', value: 'active' },
  { icon: 'done', labelKey: 'status.done', value: 'done' },
]

export const customStatusIconOptions = [
  { icon: 'waiting', labelKey: 'statusIcon.waiting' },
  { icon: 'pause', labelKey: 'statusIcon.pause' },
  { icon: 'review', labelKey: 'statusIcon.review' },
  { icon: 'archive', labelKey: 'statusIcon.archive' },
  { icon: 'block', labelKey: 'statusIcon.block' },
  { icon: 'someday', labelKey: 'statusIcon.someday' },
  { icon: 'focus', labelKey: 'statusIcon.focus' },
  { icon: 'important', labelKey: 'statusIcon.important' },
  { icon: 'repeat', labelKey: 'statusIcon.repeat' },
  { icon: 'spiral', labelKey: 'statusIcon.spiral' },
  { icon: 'connection', labelKey: 'statusIcon.connection' },
  { icon: 'wave', labelKey: 'statusIcon.wave' },
  { icon: 'arrow', labelKey: 'statusIcon.arrow' },
  { icon: 'key', labelKey: 'statusIcon.key' },
  { icon: 'infinity', labelKey: 'statusIcon.infinity' },
  { icon: 'windRose', labelKey: 'statusIcon.windRose' },
] as const satisfies ReadonlyArray<{ icon: string; labelKey: MessageKey }>

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
