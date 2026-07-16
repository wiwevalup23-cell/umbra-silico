import { PixelIcon } from '@/ui/components/silicon/PixelIcon'

export type MobileTab = 'notes' | 'editor' | 'signal'

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
  const unsavedCount = notes.filter(
    (n) => n.syncStatus === 'dirty' || n.syncStatus === 'saving',
  ).length

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
          <PixelIcon name="note" size={20} />
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
          <PixelIcon name="spark" size={20} />
        </span>
        <span className="sn-tab-bar__label">Editor</span>
      </button>

      <button
        aria-current={activeTab === 'signal' ? 'page' : undefined}
        className={`sn-tab-bar__tab${activeTab === 'signal' ? ' sn-tab-bar__tab--active' : ''}`}
        onClick={() => onTabChange('signal')}
        title="Details"
        type="button"
      >
        <span className="sn-tab-bar__icon" aria-hidden="true">
          <PixelIcon name="status" size={20} />
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
