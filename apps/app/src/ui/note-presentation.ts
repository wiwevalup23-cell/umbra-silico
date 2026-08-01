import type { MessageKey } from '@/shared/i18n'
import type { UiIconName } from '@/ui/icons/ui/UiIcon'

export type NoteStateTone = 'idle' | 'saving' | 'dirty' | 'error'

/**
 * Message keys rather than sentences: these helpers are pure and have no
 * translator, so the component that renders the badge resolves the wording in
 * whichever locale is active.
 */
export type NoteStatePresentation = {
  badgeKey: MessageKey
  icon: UiIconName
  labelKey: MessageKey
  tone: NoteStateTone
}

export function getLocalSavePresentation(
  state: 'saved' | 'queued' | 'saving' | 'error',
): NoteStatePresentation {
  if (state === 'error') {
    return {
      badgeKey: 'state.badgeReview',
      icon: 'save',
      labelKey: 'state.saveFailed',
      tone: 'error',
    }
  }

  if (state === 'queued') {
    return {
      badgeKey: 'state.badgeUnsaved',
      icon: 'save',
      labelKey: 'state.unsavedLocally',
      tone: 'dirty',
    }
  }

  if (state === 'saving') {
    return {
      badgeKey: 'state.badgeSaving',
      icon: 'save',
      labelKey: 'state.savingLocally',
      tone: 'saving',
    }
  }

  return {
    badgeKey: 'state.badgeSaved',
    icon: 'save',
    labelKey: 'state.savedLocally',
    tone: 'idle',
  }
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
    return {
      badgeKey: 'state.badgeReview',
      icon: hasRemote ? 'cloud' : 'save',
      labelKey: 'state.reviewNeeded',
      tone: 'error',
    }
  }

  if (!hasRemote) {
    if (status === 'saving' || status === 'syncing') {
      return {
        badgeKey: 'state.badgeSaving',
        icon: 'save',
        labelKey: 'state.savingLocally',
        tone: 'saving',
      }
    }

    return {
      badgeKey: 'state.badgeSaved',
      icon: 'save',
      labelKey: 'state.savedLocally',
      tone: 'idle',
    }
  }

  if (status === 'saving' || status === 'syncing') {
    return {
      badgeKey: 'state.badgeSyncing',
      icon: 'cloud',
      labelKey: 'state.syncing',
      tone: 'saving',
    }
  }

  if (status === 'dirty' || pendingOperations > 0) {
    return {
      badgeKey: 'state.badgePending',
      icon: 'cloud',
      labelKey: 'state.pendingSync',
      tone: 'dirty',
    }
  }

  return {
    badgeKey: 'state.badgeSynced',
    icon: 'cloud',
    labelKey: 'state.synced',
    tone: 'idle',
  }
}
