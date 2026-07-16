import { useRef, useState } from 'react'
import { RetroDialogShell } from '@/ui/components/silicon'
import { UiIcon } from '@/ui/icons/ui/UiIcon'

type LockModalProps = {
  error?: string | null
  isPending?: boolean
  mode: 'lock' | 'unlock'
  noteId: string
  onClose: () => void
  onSubmit?: (masterPassword: string) => void
}

export function LockModal({
  error,
  isPending = false,
  mode,
  noteId,
  onClose,
  onSubmit,
}: LockModalProps) {
  const passwordInputRef = useRef<HTMLInputElement>(null)
  const [masterPassword, setMasterPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const noteFingerprint =
    noteId.length > 18 ? `${noteId.slice(0, 3)}...${noteId.slice(-6)}` : noteId
  const noteCipherLabel = `NOTE_${noteFingerprint.toUpperCase()} · AES-GCM · NEVER LEAVES DEVICE`
  const isLocking = mode === 'lock'
  const title = isLocking ? 'Lock note' : 'Unlock note'
  const actionLabel = isLocking ? 'Lock' : 'Unlock'
  const actionHeading = isLocking ? 'Encrypt this note' : 'Decrypt this note'
  const helpText = isLocking
    ? 'Title, preview and body are sealed before the note leaves memory. There is no recovery: a forgotten master password means locked notes stay locked forever.'
    : 'Decrypt for a short local editing session. Plaintext stays out of storage.'
  const passwordsDoNotMatch = isLocking
    && confirmPassword.length > 0
    && masterPassword !== confirmPassword
  const canSubmit = Boolean(
    onSubmit
      && masterPassword.length >= 8
      && (!isLocking || masterPassword === confirmPassword)
      && !isPending,
  )
  const describedBy = [
    'sn-lock-help',
    'sn-lock-note-fingerprint',
    error ? 'sn-lock-error' : '',
    passwordsDoNotMatch ? 'sn-lock-password-mismatch' : '',
  ].filter(Boolean).join(' ')

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
            onSubmit?.(masterPassword)
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

        <div className="sn-lock-form__field">
          <label htmlFor="sn-lock-password">Master password</label>
          <div className="sn-password-input">
            <input
              aria-describedby={describedBy}
              aria-invalid={error || passwordsDoNotMatch ? true : undefined}
              autoComplete={isLocking ? 'new-password' : 'current-password'}
              disabled={isPending}
              id="sn-lock-password"
              onChange={(event) => setMasterPassword(event.target.value)}
              placeholder="At least 8 characters"
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
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        {isLocking ? (
          <div className="sn-lock-form__field">
            <label htmlFor="sn-lock-password-confirmation">Repeat master password</label>
            <input
              aria-describedby={passwordsDoNotMatch ? 'sn-lock-password-mismatch' : undefined}
              aria-invalid={passwordsDoNotMatch || undefined}
              autoComplete="new-password"
              disabled={isPending}
              id="sn-lock-password-confirmation"
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repeat the password"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
            />
          </div>
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
            title="Close"
            type="button"
          >
            Cancel
          </button>
          <button disabled={!canSubmit} title={title} type="submit">
            {isPending ? 'Working' : actionLabel}
          </button>
        </div>
      </form>
    </RetroDialogShell>
  )
}
