import { UiIcon } from '@/ui/icons/ui/UiIcon'
import { useTranslation } from '@/ui/i18n/use-translation'

export type MobileTab = 'notes' | 'editor' | 'details'

type NoteItem = { syncStatus: string }

type MobileTabBarProps = {
  activeTab: MobileTab
  hasRemote?: boolean
  notes: NoteItem[]
  onTabChange: (tab: MobileTab) => void
  pendingOperations: number
  syncStatus: string
}

export function MobileTabBar({
  activeTab,
  hasRemote = false,
  notes,
  onTabChange,
  pendingOperations,
  syncStatus,
}: MobileTabBarProps) {
  const { t } = useTranslation()
  // 'dirty' notes are already persisted locally, so only transient saves count.
  const unsavedCount = notes.filter((n) => n.syncStatus === 'saving').length

  const hasSyncIssue = hasRemote && (syncStatus === 'error' || syncStatus === 'conflict')
  const visiblePendingOperations = hasRemote ? pendingOperations : 0

  return (
    <nav className="sn-tab-bar" aria-label={t('shell.mainNavigation')}>
      <button
        aria-current={activeTab === 'notes' ? 'page' : undefined}
        className={`sn-tab-bar__tab${activeTab === 'notes' ? ' sn-tab-bar__tab--active' : ''}`}
        onClick={() => onTabChange('notes')}
        title={t('library.notes')}
        type="button"
      >
        <span className="sn-tab-bar__icon" aria-hidden="true">
          <UiIcon height={20} name="document" width={20} />
        </span>
        <span className="sn-tab-bar__label">{t('library.notes')}</span>
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
        title={t('shell.editor')}
        type="button"
      >
        <span className="sn-tab-bar__icon" aria-hidden="true">
          <UiIcon height={20} name="edit" width={20} />
        </span>
        <span className="sn-tab-bar__label">{t('shell.editor')}</span>
      </button>

      <button
        aria-current={activeTab === 'details' ? 'page' : undefined}
        className={`sn-tab-bar__tab${activeTab === 'details' ? ' sn-tab-bar__tab--active' : ''}`}
        onClick={() => onTabChange('details')}
        title={t('shell.details')}
        type="button"
      >
        <span className="sn-tab-bar__icon" aria-hidden="true">
          <UiIcon height={20} name="activity" width={20} />
        </span>
        <span className="sn-tab-bar__label">{t('shell.details')}</span>
        {(visiblePendingOperations > 0 || hasSyncIssue) && (
          <span
            aria-label={hasSyncIssue ? 'Sync issue' : `${visiblePendingOperations} pending`}
            className={`sn-tab-bar__badge${hasSyncIssue ? ' sn-tab-bar__badge--error' : ''}`}
          >
            {hasSyncIssue ? '!' : visiblePendingOperations > 99 ? '99+' : visiblePendingOperations}
          </span>
        )}
      </button>
    </nav>
  )
}
