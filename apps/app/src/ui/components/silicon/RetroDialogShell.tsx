import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { SquircleButton } from '@/ui/components/silicon/SquircleButton'
import { useTranslation } from '@/ui/i18n/use-translation'

type RetroDialogShellProps = {
  children: ReactNode
  className?: string
  closeDisabled?: boolean
  /** A specific accessible name for the close button; defaults to "Close: <title>". */
  closeLabel?: string
  describedBy?: string
  initialFocusRef?: RefObject<HTMLElement | null>
  labelledBy: string
  onClose: () => void
  showTitlebar?: boolean
  title: string
}

export function RetroDialogShell({
  children,
  className = '',
  closeDisabled = false,
  closeLabel,
  describedBy,
  initialFocusRef,
  labelledBy,
  onClose,
  showTitlebar = true,
  title,
}: RetroDialogShellProps) {
  const { t } = useTranslation()
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    const previouslyFocused = document.activeElement

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

    const focusFrame = window.requestAnimationFrame(() => {
      initialFocusRef?.current?.focus()
    })

    return () => {
      window.cancelAnimationFrame(focusFrame)

      if (dialog.open) {
        if (typeof dialog.close === 'function') {
          dialog.close()
        } else {
          dialog.removeAttribute('open')
        }
      }

      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus()
      }
    }
  }, [initialFocusRef])

  return (
    <dialog
      aria-describedby={describedBy}
      aria-labelledby={labelledBy}
      aria-modal="true"
      className={`sn-modal sn-modal--retro ${className}`.trim()}
      onCancel={(event) => {
        if (closeDisabled) {
          event.preventDefault()
          return
        }

        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) {
          onClose()
        }
      }}
      ref={dialogRef}
    >
      <div className="sn-modal__surface">
        {showTitlebar ? (
          <header className="sn-lock-titlebar">
            <span aria-hidden="true" />
            <h2 id={labelledBy}>{title}</h2>
            <span aria-hidden="true" />
            <SquircleButton
              aria-label={closeLabel ?? `${t('action.close')}: ${title.toLocaleLowerCase()}`}
              disabled={closeDisabled}
              icon="close"
              onClick={onClose}
              title={t('action.close')}
            />
          </header>
        ) : null}
        {children}
      </div>
    </dialog>
  )
}
