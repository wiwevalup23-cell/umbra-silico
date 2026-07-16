import { UiIcon } from '@/ui/icons/ui/UiIcon'

export type MobileTab = 'notes' | 'editor' | 'details'

type NoteItem = { syncStatus: string }

type MobileTabBarProps = {
  activeTab: MobileTab
  notes: NoteItem[]
  onTabChange: (tab: MobileTab) => void
  pendingOperations: number
  syncStatus: string
}

export function MobileTabBar({
  activeTab,
  notes,
  onTabChange,
  pendingOperations,
  syncStatus,
}: MobileTabBarProps) {
  // 'dirty' notes are already persisted locally, so only transient saves count.
  const unsavedCount = notes.filter((n) => n.syncStatus === 'saving').length

  const hasSyncIssue = syncStatus === 'error' || syncStatus === 'conflict'

  return (
    <nav className="sn-tab-bar" aria-label="Main navigation">
      <button
        aria-current={activeTab === 'notes' ? 'page' : undefined}
        className={`sn-tab-bar__tab${activeTab === 'notes' ? ' sn-tab-bar__tab--active' : ''}`}
        onClick={() => onTabChange('notes')}
        title="Notes"
        type="button"
      >
        <span className="sn-tab-bar__icon" aria-hidden="true">
          <UiIcon height={20} name="document" width={20} />
        </span>
        <span className="sn-tab-bar__label">Notes</span>
        {unsavedCount > 0 && (
          <span
            aria-label={`${unsavedCount} unsaved`}
            className="sn-tab-bar__badge"
          >
            {unsavedCount > 99 ? '99+' : unsavedCount}
          </span>
        )}
      </button>

      <button
        aria-current={activeTab === 'editor' ? 'page' : undefined}
        className={`sn-tab-bar__tab${activeTab === 'editor' ? ' sn-tab-bar__tab--active' : ''}`}
        onClick={() => onTabChange('editor')}
        title="Editor"
        type="button"
      >
        <span className="sn-tab-bar__icon" aria-hidden="true">
          <UiIcon height={20} name="edit" width={20} />
        </span>
        <span className="sn-tab-bar__label">Editor</span>
      </button>

      <button
        aria-current={activeTab === 'details' ? 'page' : undefined}
        className={`sn-tab-bar__tab${activeTab === 'details' ? ' sn-tab-bar__tab--active' : ''}`}
        onClick={() => onTabChange('details')}
        title="Details"
        type="button"
      >
        <span className="sn-tab-bar__icon" aria-hidden="true">
          <UiIcon height={20} name="activity" width={20} />
        </span>
        <span className="sn-tab-bar__label">Details</span>
        {(pendingOperations > 0 || hasSyncIssue) && (
          <span
            aria-label={hasSyncIssue ? 'Sync issue' : `${pendingOperations} pending`}
            className={`sn-tab-bar__badge${hasSyncIssue ? ' sn-tab-bar__badge--error' : ''}`}
          >
            {hasSyncIssue ? '!' : pendingOperations > 99 ? '99+' : pendingOperations}
          </span>
        )}
      </button>
    </nav>
  )
}
