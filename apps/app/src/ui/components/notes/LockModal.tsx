import { useRef, useState } from 'react'
import { RetroDialogShell } from '@/ui/components/silicon'
import { UiIcon } from '@/ui/icons/ui/UiIcon'
import { useTranslation } from '@/ui/i18n/use-translation'

// A format mask, not prose: it reads the same in every language.
const recoveryKeyMask = 'XXXXX-XXXXX-XXXXX-XXXXX'

export type LockModalCredentials = {
  masterPassword?: string
  recoveryKey?: string
}

type LockModalProps = {
  error?: string | null
  isPending?: boolean
  mode: 'lock' | 'unlock'
  noteId: string
  onClose: () => void
  onSubmit?: (credentials: LockModalCredentials) => void
  /** Set once, right after the lock that created the vault. */
  recoveryKey?: string | null
  onAcknowledgeRecoveryKey?: () => void
}

function RecoveryKeyPanel({
  onAcknowledge,
  recoveryKey,
}: {
  onAcknowledge?: () => void
  recoveryKey: string
}) {
  const { t } = useTranslation()
  const acknowledgeRef = useRef<HTMLButtonElement>(null)
  const [isSaved, setIsSaved] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  function download() {
    const blob = new Blob(
      [
        'Umbra Silico recovery key\n\n',
        `${recoveryKey}\n\n`,
        'This key unlocks your encrypted notes if you forget the master password.\n',
        'Anyone holding it can read them. Keep it somewhere safe and offline.\n',
      ],
      { type: 'text/plain' },
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'umbra-silico-recovery-key.txt'
    link.click()
    URL.revokeObjectURL(url)
    setIsSaved(true)
  }

  return (
    <div className="sn-recovery-panel">
      <div className="sn-lock-form__intro">
        <span className="sn-modal-icon">
          <UiIcon name="shield" />
        </span>
        <div>
          <h3>{t('lock.recoveryHeading')}</h3>
          <p className="sn-lock-form__help">
            This is the only other way into your encrypted notes. It is shown once and
            never stored in readable form — if you lose both this key and your master
            password, the notes cannot be recovered by anyone.
          </p>
        </div>
      </div>

      <code className="sn-recovery-key" data-testid="recovery-key">
        {recoveryKey}
      </code>

      <div className="sn-recovery-panel__actions">
        <button
          onClick={() => {
            void navigator.clipboard
              ?.writeText(recoveryKey)
              .then(() => {
                setCopyState('copied')
                setIsSaved(true)
              })
              .catch(() => setCopyState('failed'))
          }}
          type="button"
        >
          {t(copyState === 'copied' ? 'lock.copied' : copyState === 'failed' ? 'lock.copyFailed' : 'lock.copy')}
        </button>
        <button onClick={download} type="button">
          {t('lock.download')}
        </button>
      </div>

      <label className="sn-recovery-panel__confirm">
        <input
          checked={isSaved}
          onChange={(event) => setIsSaved(event.target.checked)}
          type="checkbox"
        />
        <span>{t('lock.savedConfirm')}</span>
      </label>

      <div className="sn-modal-actions">
        <button
          disabled={!isSaved}
          onClick={onAcknowledge}
          ref={acknowledgeRef}
          type="button"
        >
          {t('lock.done')}
        </button>
      </div>
    </div>
  )
}

export function LockModal({
  error,
  isPending = false,
  mode,
  noteId,
  onAcknowledgeRecoveryKey,
  onClose,
  onSubmit,
  recoveryKey = null,
}: LockModalProps) {
  const { t } = useTranslation()
  const passwordInputRef = useRef<HTMLInputElement>(null)
  const [masterPassword, setMasterPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [recoveryInput, setRecoveryInput] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [useRecoveryKey, setUseRecoveryKey] = useState(false)
  const noteFingerprint =
    noteId.length > 18 ? `${noteId.slice(0, 3)}...${noteId.slice(-6)}` : noteId
  const noteCipherLabel = `NOTE_${noteFingerprint.toUpperCase()} · AES-GCM · NEVER LEAVES DEVICE`
  const isLocking = mode === 'lock'
  const title = t(isLocking ? 'lock.lockTitle' : 'lock.unlockTitle')
  const actionLabel = t(isLocking ? 'lock.lockAction' : 'lock.unlockAction')
  const actionHeading = t(isLocking ? 'lock.encryptHeading' : 'lock.decryptHeading')
  const helpText = isLocking
    ? t('lock.encryptHelp')
    : t('lock.decryptHelp')
  const passwordsDoNotMatch = isLocking
    && confirmPassword.length > 0
    && masterPassword !== confirmPassword
  const canSubmit = Boolean(
    onSubmit
      && !isPending
      && (useRecoveryKey
        ? recoveryInput.trim().length > 0
        : masterPassword.length >= 8 && (!isLocking || masterPassword === confirmPassword)),
  )
  const describedBy = [
    'sn-lock-help',
    'sn-lock-note-fingerprint',
    error ? 'sn-lock-error' : '',
    passwordsDoNotMatch ? 'sn-lock-password-mismatch' : '',
  ].filter(Boolean).join(' ')

  // The recovery key replaces the form entirely: the lock already succeeded,
  // and this is the only moment the key can be read.
  if (recoveryKey) {
    return (
      <RetroDialogShell
        className="sn-modal--lock"
        closeDisabled
        labelledBy="sn-lock-modal-title"
        onClose={() => undefined}
        title={t('lock.recoveryTitle')}
      >
        <RecoveryKeyPanel
          onAcknowledge={onAcknowledgeRecoveryKey}
          recoveryKey={recoveryKey}
        />
      </RetroDialogShell>
    )
  }

  return (
    <RetroDialogShell
      className="sn-modal--lock"
      closeDisabled={isPending}
      describedBy={describedBy}
      initialFocusRef={passwordInputRef}
      labelledBy="sn-lock-modal-title"
      onClose={onClose}
      title={title}
    >
      <form
        className="sn-lock-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (canSubmit) {
            onSubmit?.(
              useRecoveryKey
                ? { recoveryKey: recoveryInput.trim() }
                : { masterPassword },
            )
          }
        }}
      >
        <div className="sn-lock-form__intro">
          <span className="sn-modal-icon">
            <UiIcon name={isLocking ? 'lock' : 'unlock'} />
          </span>
          <div>
            <h3>{actionHeading}</h3>
            <p className="sn-lock-form__help" id="sn-lock-help">
              {helpText}
            </p>
          </div>
        </div>

        {useRecoveryKey ? (
          <div className="sn-lock-form__field">
            <label htmlFor="sn-lock-recovery">{t('lock.recoveryTitle')}</label>
            <input
              aria-describedby={describedBy}
              aria-invalid={error ? true : undefined}
              autoComplete="off"
              disabled={isPending}
              id="sn-lock-recovery"
              onChange={(event) => setRecoveryInput(event.target.value)}
              placeholder={recoveryKeyMask}
              spellCheck={false}
              type="text"
              value={recoveryInput}
            />
          </div>
        ) : (
          <div className="sn-lock-form__field">
            <label htmlFor="sn-lock-password">{t('lock.masterPassword')}</label>
            <div className="sn-password-input">
              <input
                aria-describedby={describedBy}
                aria-invalid={error || passwordsDoNotMatch ? true : undefined}
                autoComplete={isLocking ? 'new-password' : 'current-password'}
                disabled={isPending}
                id="sn-lock-password"
                onChange={(event) => setMasterPassword(event.target.value)}
                placeholder={t('lock.passwordPlaceholder')}
                ref={passwordInputRef}
                type={showPassword ? 'text' : 'password'}
                value={masterPassword}
              />
              <button
                aria-pressed={showPassword}
                disabled={isPending}
                onClick={() => setShowPassword((visible) => !visible)}
                type="button"
              >
                {t(showPassword ? 'lock.hide' : 'lock.show')}
              </button>
            </div>
          </div>
        )}

        {isLocking && !useRecoveryKey ? (
          <div className="sn-lock-form__field">
            <label htmlFor="sn-lock-password-confirmation">{t('lock.repeatPassword')}</label>
            <input
              aria-describedby={passwordsDoNotMatch ? 'sn-lock-password-mismatch' : undefined}
              aria-invalid={passwordsDoNotMatch || undefined}
              autoComplete="new-password"
              disabled={isPending}
              id="sn-lock-password-confirmation"
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder={t('lock.repeatPlaceholder')}
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
            />
          </div>
        ) : null}

        {!isLocking ? (
          <button
            className="sn-lock-form__switch"
            disabled={isPending}
            onClick={() => setUseRecoveryKey((active) => !active)}
            type="button"
          >
            {t(useRecoveryKey ? 'lock.useMasterPassword' : 'lock.useRecoveryKey')}
          </button>
        ) : null}

        {passwordsDoNotMatch ? (
          <p
            aria-live="polite"
            className="sn-lock-form__error"
            id="sn-lock-password-mismatch"
          >
            Passwords do not match.
          </p>
        ) : null}
        {error ? (
          <p
            aria-live="assertive"
            className="sn-lock-form__error"
            id="sn-lock-error"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <code className="sn-note-fingerprint" id="sn-lock-note-fingerprint">
          {noteCipherLabel}
        </code>
        <div className="sn-modal-actions">
          <button
            disabled={isPending}
            onClick={onClose}
            title={t('action.close')}
            type="button"
          >
            Cancel
          </button>
          <button disabled={!canSubmit} title={title} type="submit">
            {isPending ? t('lock.working') : actionLabel}
          </button>
        </div>
      </form>
    </RetroDialogShell>
  )
}
