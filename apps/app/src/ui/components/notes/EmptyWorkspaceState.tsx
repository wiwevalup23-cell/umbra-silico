import { EmptyStatePlayer } from '@/ui/components/notes/EmptyStatePlayer'
import { UiIcon } from '@/ui/icons/ui/UiIcon'
import { useTranslation } from '@/ui/i18n/use-translation'

type EmptyWorkspaceStateProps = {
  isCreatingNote?: boolean
  onBrowseTemplates?: () => void
  onCreateNote: () => void
  pendingOperations: number
  syncStatus: string
}

/**
 * What the editor panel holds when no note is open.
 *
 * This is a state of the workspace, not of the editor: it has no document, no
 * autosave and no TipTap. Keeping it out of the editor module is also what
 * lets the editor stay behind a lazy import — the library can paint this
 * without loading ProseMirror at all.
 */
export function EmptyWorkspaceState({
  isCreatingNote = false,
  onBrowseTemplates,
  onCreateNote,
  pendingOperations,
  syncStatus,
}: EmptyWorkspaceStateProps) {
  const { t } = useTranslation()

  return (
    <article
      className="sn-editor-shell sn-editor-shell--empty"
      aria-label={t('editor.region')}
    >
      {/* Desktop: decorative player (hidden on mobile via CSS) */}
      <EmptyStatePlayer
        isCreatingNote={isCreatingNote}
        onCreateNote={onCreateNote}
        pendingOperations={pendingOperations}
        syncStatus={syncStatus}
      />
      <div className="sn-mobile-empty-state" aria-hidden="true">
        <span className="sn-mobile-empty-state__icon">
          <UiIcon name="document" />
        </span>
        <strong>Start with a note</strong>
        <p>Create a blank page or choose a template to begin writing.</p>
      </div>
      <div className="sn-empty-actions" aria-label={t('editor.createNote')}>
        <button
          className="sn-empty-actions__primary"
          disabled={isCreatingNote}
          onClick={onCreateNote}
          type="button"
        >
          <UiIcon name="plus" />
          New blank note
        </button>
        {onBrowseTemplates ? (
          <button onClick={onBrowseTemplates} type="button">
            <UiIcon name="template" />
            Browse templates
          </button>
        ) : null}
      </div>
    </article>
  )
}
