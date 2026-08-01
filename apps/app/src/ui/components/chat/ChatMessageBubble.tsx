import { useEffect, useRef, useState } from 'react'
import type { ChatMessage, ChatMessageContent } from '@/shared/contracts'
import { UiIcon } from '@/ui/icons/ui/UiIcon'
import { ChatComposer } from '@/ui/components/chat/ChatComposer'
import {
  collectPlainText,
  isComposerEditableContent,
} from '@/ui/components/chat/chat-content-utils'
import { ChatMessageContentView } from '@/ui/components/chat/chat-message-content'
import { useTranslation } from '@/ui/i18n/use-translation'

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
})

function formatTime(createdAt: string): string {
  const date = new Date(createdAt)
  return Number.isNaN(date.getTime()) ? '' : timeFormatter.format(date)
}

type ChatMessageBubbleProps = {
  isEditing: boolean
  message: ChatMessage
  onCancelEdit: () => void
  onDelete: (messageId: string) => void
  onSetPinned: (messageId: string, pinned: boolean) => void
  onStartEdit: (messageId: string) => void
  onSubmitEdit: (messageId: string, content: ChatMessageContent) => void
}

export function ChatMessageBubble({
  isEditing,
  message,
  onCancelEdit,
  onDelete,
  onSetPinned,
  onStartEdit,
  onSubmitEdit,
}: ChatMessageBubbleProps) {
  const { t } = useTranslation()
  const [isActionsOpen, setIsActionsOpen] = useState(false)
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false)
  const actionsRef = useRef<HTMLDivElement>(null)
  const time = formatTime(message.createdAt)
  const plainText = collectPlainText(message.content)
  const canEdit = isComposerEditableContent(message.content)
  const canCopy = plainText.length > 0

  useEffect(() => {
    if (!isActionsOpen) {
      setIsDeleteConfirming(false)
      return
    }

    function handlePointerDown(event: PointerEvent) {
      if (!actionsRef.current?.contains(event.target as Node)) {
        setIsActionsOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsActionsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isActionsOpen])

  if (isEditing) {
    return (
      <div
        className="sn-chat-bubble sn-chat-bubble--editing"
        data-message-id={message.id}
        data-side={message.side}
      >
        <ChatComposer
          autoFocus
          initialContent={message.content}
          onCancel={onCancelEdit}
          onSubmit={(content) => onSubmitEdit(message.id, content)}
          placeholder={t('chat.editMessage')}
          submitLabel={t('chat.saveChanges')}
        />
      </div>
    )
  }

  return (
    <div
      className="sn-chat-bubble"
      data-message-id={message.id}
      data-side={message.side}
    >
      <div className="sn-chat-bubble__actions" ref={actionsRef}>
        <button
          aria-expanded={isActionsOpen}
          aria-haspopup="menu"
          aria-label={t('chat.messageActions')}
          className="sn-chat-bubble__action-trigger"
          onClick={() => setIsActionsOpen((isOpen) => !isOpen)}
          title={t('chat.messageActions')}
          type="button"
        >
          <UiIcon height={15} name="moreHorizontal" width={15} />
        </button>
        {isActionsOpen ? (
          <div aria-label={t('chat.messageActions')} className="sn-chat-bubble__action-menu" role="menu">
            {isDeleteConfirming ? (
              <div
                aria-label={t('chat.confirmDeletion')}
                className="sn-chat-bubble__delete-confirm"
                role="alert"
              >
                <strong>{t('chat.deleteQuestion')}</strong>
                <div>
                  <button
                    onClick={() => setIsDeleteConfirming(false)}
                    role="menuitem"
                    type="button"
                  >
                    {t('action.cancel')}
                  </button>
                  <button
                    className="sn-chat-bubble__action-danger"
                    onClick={() => {
                      setIsActionsOpen(false)
                      onDelete(message.id)
                    }}
                    role="menuitem"
                    type="button"
                  >
                    {t('chat.delete')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {canCopy ? (
                  <button
                    onClick={() => {
                      setIsActionsOpen(false)
                      void navigator.clipboard?.writeText(plainText)
                    }}
                    role="menuitem"
                    type="button"
                  >
                    <UiIcon height={14} name="copy" width={14} />
                    {t('chat.copyText')}
                  </button>
                ) : null}
                <button
                  onClick={() => {
                    setIsActionsOpen(false)
                    onSetPinned(message.id, message.pinnedAt === null)
                  }}
                  role="menuitem"
                  type="button"
                >
                  <UiIcon height={14} name="pin" width={14} />
                  {t(message.pinnedAt ? 'chat.unpin' : 'chat.pin')}
                </button>
                {canEdit ? (
                  <button
                    onClick={() => {
                      setIsActionsOpen(false)
                      onStartEdit(message.id)
                    }}
                    role="menuitem"
                    type="button"
                  >
                    <UiIcon height={14} name="edit" width={14} />
                    {t('chat.edit')}
                  </button>
                ) : null}
                <button
                  className="sn-chat-bubble__action-danger"
                  onClick={() => {
                    setIsDeleteConfirming(true)
                  }}
                  role="menuitem"
                  type="button"
                >
                  <UiIcon height={14} name="trash" width={14} />
                  Delete
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {message.side === 'other' && message.senderName ? (
        <strong className="sn-chat-bubble__sender">{message.senderName}</strong>
      ) : null}
      <ChatMessageContentView content={message.content} />

      <span className="sn-chat-bubble__meta">
        {message.pinnedAt ? <em className="sn-chat-bubble__pinned">pinned</em> : null}
        {message.editedAt ? <em>edited</em> : null}
        {time ? <time dateTime={message.createdAt}>{time}</time> : null}
      </span>
    </div>
  )
}
