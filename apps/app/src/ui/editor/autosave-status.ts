import type { AutosaveStatus } from './debounced-autosave'

export type AutosaveState = 'saved' | 'queued' | 'saving' | 'error'

/**
 * One badge over two independent autosaves — the document's and the title's.
 *
 * They were sharing a single state variable, so whichever finished last had
 * the final word: a save landing while the other was still queued reported
 * "saved" over unsaved work, and the Save button greyed out at exactly the
 * moment there was something to save.
 *
 * Unsaved work outranks a write already under way, because that is the part
 * the reader needs to know and the part the button has to stay reachable for.
 */
export function mergeAutosaveStatus(
  documentStatus: AutosaveStatus,
  titleStatus: AutosaveStatus,
): AutosaveState {
  if (documentStatus === 'error' || titleStatus === 'error') {
    return 'error'
  }

  if (documentStatus === 'queued' || titleStatus === 'queued') {
    return 'queued'
  }

  if (documentStatus === 'saving' || titleStatus === 'saving') {
    return 'saving'
  }

  return 'saved'
}
