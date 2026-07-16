import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { UiIcon } from '@/ui/icons/ui/UiIcon'

type RetroDialogShellProps = {
  children: ReactNode
  className?: string
  closeDisabled?: boolean
  describedBy?: string
  initialFocusRef?: RefObject<HTMLElement | null>
  labelledBy: string
  onClose: () => void
  title: string
}

export function RetroDialogShell({
  children,
  className = '',
  closeDisabled = false,
  describedBy,
  initialFocusRef,
  labelledBy,
  onClose,
  title,
}: RetroDialogShellProps) {
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
        <header className="sn-lock-titlebar">
          <span aria-hidden="true" />
          <h2 id={labelledBy}>{title}</h2>
          <span aria-hidden="true" />
          <button
            aria-label={`Close ${title.toLocaleLowerCase()}`}
            disabled={closeDisabled}
            onClick={onClose}
            title="Close"
            type="button"
          >
            <UiIcon name="close" />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  )
}
