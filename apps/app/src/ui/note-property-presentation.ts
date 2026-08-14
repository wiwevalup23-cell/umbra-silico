import {
  customNotePropertyStatusPrefix,
  type NotePropertyMarker,
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
  { icon: 'status.none', labelKey: 'status.none', value: 'none' },
  { icon: 'status.incoming', labelKey: 'status.incoming', value: 'incoming' },
  { icon: 'status.draft', labelKey: 'status.draft', value: 'draft' },
  { icon: 'status.in_progress', labelKey: 'status.inProgress', value: 'in_progress' },
  { icon: 'status.deferred', labelKey: 'status.deferred', value: 'deferred' },
  { icon: 'status.waiting', labelKey: 'status.waiting', value: 'waiting' },
  { icon: 'status.review', labelKey: 'status.review', value: 'review' },
  { icon: 'status.completed', labelKey: 'status.completed', value: 'completed' },
  { icon: 'status.archived', labelKey: 'status.archived', value: 'archived' },
]

export const customStatusIconOptions = [
  { icon: 'status.incoming', labelKey: 'status.incoming' },
  { icon: 'status.draft', labelKey: 'status.draft' },
  { icon: 'status.in_progress', labelKey: 'status.inProgress' },
  { icon: 'status.deferred', labelKey: 'status.deferred' },
  { icon: 'status.waiting', labelKey: 'status.waiting' },
  { icon: 'status.review', labelKey: 'status.review' },
  { icon: 'status.completed', labelKey: 'status.completed' },
  { icon: 'status.archived', labelKey: 'status.archived' },
] as const satisfies ReadonlyArray<{ icon: string; labelKey: MessageKey }>

export type PropertyMarkerPresentation = {
  icon: `marker.${NotePropertyMarker}`
  labelKey: MessageKey
  value: NotePropertyMarker
}

export const propertyMarkerOptions: readonly PropertyMarkerPresentation[] = [
  { icon: 'marker.important', labelKey: 'marker.important', value: 'important' },
  { icon: 'marker.favorite', labelKey: 'marker.favorite', value: 'favorite' },
  { icon: 'marker.return', labelKey: 'marker.return', value: 'return' },
  { icon: 'marker.question', labelKey: 'marker.question', value: 'question' },
  { icon: 'marker.idea', labelKey: 'marker.idea', value: 'idea' },
  { icon: 'marker.observation', labelKey: 'marker.observation', value: 'observation' },
  { icon: 'marker.source', labelKey: 'marker.source', value: 'source' },
  { icon: 'marker.linked', labelKey: 'marker.linked', value: 'linked' },
  { icon: 'marker.pinned', labelKey: 'marker.pinned', value: 'pinned' },
  { icon: 'marker.private', labelKey: 'marker.private', value: 'private' },
  { icon: 'marker.conflict', labelKey: 'marker.conflict', value: 'conflict' },
  { icon: 'marker.fragile', labelKey: 'marker.fragile', value: 'fragile' },
  { icon: 'marker.dead_end', labelKey: 'marker.deadEnd', value: 'dead_end' },
]

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
  // Preserve old persisted meanings while presenting them in the new family.
  if (value === 'idea') return propertyStatusOptions[2]
  if (value === 'active') return propertyStatusOptions[3]
  if (value === 'done') return propertyStatusOptions[7]

  return propertyStatusOptions.find((option) => option.value === value)
    ?? parseCustomPropertyStatus(value)
    ?? propertyStatusOptions[0]
}
