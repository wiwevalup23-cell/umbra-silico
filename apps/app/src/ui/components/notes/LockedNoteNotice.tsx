import type { NoteSyncStatus } from '@/shared/contracts/note'
import { UiIcon } from '@/ui/icons/ui/UiIcon'
import { useTranslation } from '@/ui/i18n/use-translation'
import { getPersistencePresentation } from '@/ui/note-presentation'

type LockedNoteNoticeProps = {
  hasRemote?: boolean
  pendingOperations: number
  syncStatus: NoteSyncStatus
}

/**
 * The editor panel for a note whose body is ciphertext.
 *
 * Deliberately not part of the editor module: there is nothing to edit, and
 * routing a locked note through the editor would mean the editor had to know
 * about the lock state of the thing it cannot open.
 */
export function LockedNoteNotice({
  hasRemote = false,
  pendingOperations,
  syncStatus,
}: LockedNoteNoticeProps) {
  const { t } = useTranslation()
  const persistence = getPersistencePresentation({
    hasRemote,
    pendingOperations,
    status: syncStatus,
  })
  const statusBadges = [
    {
      icon: 'lock' as const,
      label: t('editor.locked'),
      title: t('editor.privacyLocked'),
    },
    {
      icon: persistence.icon,
      label: t(persistence.badgeKey),
      title: t('editor.stateTitle', { state: t(persistence.labelKey) }),
    },
  ]

  return (
    <article className="sn-editor-shell" aria-label={t('editor.region')}>
      <div className="sn-editor-paper-sheet">
        <header className="sn-editor-topbar">
          <div className="sn-editor-title-row">
            <div className="sn-editor-title-group">
              <span className="sn-editor-icon">
                <UiIcon name="lock" />
              </span>
              <h1 className="sn-editor-document-title">Locked note</h1>
            </div>
            <div className="sn-editor-status-badges" aria-label={t('editor.noteStatus')}>
              {statusBadges.map((badge) => (
                <span className="sn-editor-status-badge" key={badge.title} title={badge.title}>
                  <UiIcon name={badge.icon} />
                  {badge.label}
                </span>
              ))}
            </div>
          </div>
        </header>

        <div className="sn-editor-paper">
          <div className="sn-locked-paper">
            <UiIcon name="lock" />
            <h3>Encrypted</h3>
            <p>Master password required.</p>
          </div>
        </div>
      </div>
    </article>
  )
}
