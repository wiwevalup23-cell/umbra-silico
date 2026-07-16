import { useEffect, useRef, useState } from 'react'
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
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [masterPassword, setMasterPassword] = useState('')
  const noteFingerprint =
    noteId.length > 18 ? `${noteId.slice(0, 3)}...${noteId.slice(-6)}` : noteId
  const noteCipherLabel = `NOTE_${noteFingerprint.replace('...', '...').toUpperCase()} · AES-GCM · NEVER LEAVES DEVICE`
  const isLocking = mode === 'lock'
  const title = isLocking ? 'Lock note' : 'Unlock note'
  const actionLabel = isLocking ? 'Lock' : 'Unlock'
  const actionHeading = isLocking ? 'Encrypt this note' : 'Decrypt this note'
  const helpText = isLocking
    ? 'Title, preview and body are sealed before the note leaves memory.'
    : 'Decrypt for a short local editing session. Plaintext stays out of storage.'
  const passwordDescription = error ? 'sn-lock-help sn-lock-error' : 'sn-lock-help'

  useEffect(() => {
    const dialog = dialogRef.current

    if (!dialog) {
      return
    }

    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) {
        dialog.showModal()
      }
    } else {
      dialog.setAttribute('open', '')
    }

    return () => {
      if (dialog.open) {
        dialog.close()
      }
    }
  }, [])

  return (
    <dialog
      aria-describedby="sn-lock-help sn-lock-note-fingerprint"
      aria-labelledby="sn-lock-modal-title"
      aria-modal="true"
      className="sn-modal sn-modal--lock"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
      ref={dialogRef}
    >
      <div className="sn-modal__surface">
        <header className="sn-lock-titlebar">
          <span aria-hidden="true" />
          <h2 id="sn-lock-modal-title">{title}</h2>
          <span aria-hidden="true" />
          <button
            aria-label="Close"
            disabled={isPending}
            onClick={onClose}
            title="Close"
            type="button"
          />
        </header>

        <form
          className="sn-lock-form"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit?.(masterPassword)
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
            <input
              aria-describedby={passwordDescription}
              aria-invalid={error ? true : undefined}
              autoFocus
              autoComplete="current-password"
              disabled={isPending}
              id="sn-lock-password"
              onChange={(event) => {
                setMasterPassword(event.target.value)
              }}
              placeholder="At least 8 characters"
              type="password"
              value={masterPassword}
            />
          </div>
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
              Close
            </button>
            <button
              disabled={!onSubmit || masterPassword.length < 8 || isPending}
              title={title}
              type="submit"
            >
              {isPending ? 'Working' : actionLabel}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
