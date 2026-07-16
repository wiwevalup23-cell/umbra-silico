import type { UiIconName } from '@/ui/icons/ui/UiIcon'

export type NoteStateTone = 'idle' | 'saving' | 'dirty' | 'error'

export type NoteStatePresentation = {
  badge: string
  icon: UiIconName
  label: string
  tone: NoteStateTone
}

export function getLocalSavePresentation(
  state: 'saved' | 'queued' | 'saving' | 'error',
): NoteStatePresentation {
  if (state === 'error') {
    return { badge: 'Review', icon: 'save', label: 'Save failed', tone: 'error' }
  }

  if (state === 'queued') {
    return { badge: 'Unsaved', icon: 'save', label: 'Unsaved locally', tone: 'dirty' }
  }

  if (state === 'saving') {
    return { badge: 'Saving', icon: 'save', label: 'Saving locally', tone: 'saving' }
  }

  return { badge: 'Saved', icon: 'save', label: 'Saved locally', tone: 'idle' }
}

export function getPersistencePresentation({
  hasRemote,
  pendingOperations = 0,
  status,
}: {
  hasRemote: boolean
  pendingOperations?: number
  status: string
}): NoteStatePresentation {
  if (status === 'error' || status === 'conflict') {
    return { badge: 'Review', icon: hasRemote ? 'cloud' : 'save', label: 'Review needed', tone: 'error' }
  }

  if (!hasRemote) {
    if (status === 'saving' || status === 'syncing') {
      return { badge: 'Saving', icon: 'save', label: 'Saving locally', tone: 'saving' }
    }

    return { badge: 'Saved', icon: 'save', label: 'Saved locally', tone: 'idle' }
  }

  if (status === 'saving' || status === 'syncing') {
    return { badge: 'Syncing', icon: 'cloud', label: 'Syncing', tone: 'saving' }
  }

  if (status === 'dirty' || pendingOperations > 0) {
    return { badge: 'Pending', icon: 'cloud', label: 'Pending sync', tone: 'dirty' }
  }

  return { badge: 'Synced', icon: 'cloud', label: 'Synced', tone: 'idle' }
}
