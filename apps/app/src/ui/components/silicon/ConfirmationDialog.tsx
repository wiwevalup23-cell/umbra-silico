import { useRef } from 'react'
import { UiIcon } from '@/ui/icons/ui/UiIcon'
import { RetroDialogShell } from './RetroDialogShell'

type ConfirmationDialogProps = {
  confirmLabel: string
  description: string
  isPending?: boolean
  onCancel: () => void
  onConfirm: () => void
  title: string
}

export function ConfirmationDialog({
  confirmLabel,
  description,
  isPending = false,
  onCancel,
  onConfirm,
  title,
}: ConfirmationDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  return (
    <RetroDialogShell
      className="sn-modal--confirm"
      closeDisabled={isPending}
      describedBy="sn-confirm-dialog-description"
      initialFocusRef={cancelButtonRef}
      labelledBy="sn-confirm-dialog-title"
      onClose={onCancel}
      title="Confirm action"
    >
      <div className="sn-confirm-dialog">
        <span className="sn-modal-icon sn-modal-icon--danger" aria-hidden="true">
          <UiIcon name="trash" />
        </span>
        <div>
          <h3 id="sn-confirm-dialog-title">{title}</h3>
          <p id="sn-confirm-dialog-description">{description}</p>
        </div>
      </div>
      <div className="sn-modal-actions sn-confirm-dialog__actions">
        <button
          disabled={isPending}
          onClick={onCancel}
          ref={cancelButtonRef}
          type="button"
        >
          Cancel
        </button>
        <button
          className="sn-danger-button"
          disabled={isPending}
          onClick={onConfirm}
          type="button"
        >
          {isPending ? 'Deleting' : confirmLabel}
        </button>
      </div>
    </RetroDialogShell>
  )
}
