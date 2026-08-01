import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react'
import type {
  ChatMessage,
  ChatMessageContent,
  ChatMessageSide,
  ImageSourceResolver,
  NoteId,
  PlaintextLocalNote,
} from '@/shared/contracts'
import { ImageSourceContext } from '@/ui/editor/image-source-context'
import { UiIcon } from '@/ui/icons/ui/UiIcon'
import { ChatComposer } from '@/ui/components/chat/ChatComposer'
import { ChatMessageBubble } from '@/ui/components/chat/ChatMessageBubble'
import { collectPlainText } from '@/ui/components/chat/chat-content-utils'
import type { Translator } from '@/shared/i18n'
import { useTranslation } from '@/ui/i18n/use-translation'

/** Just the lookup half of the translator, for module-level helpers. */
type Translate = Translator['t']

const visibleMessagesStep = 100

const dayLabelFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function formatDayLabel(createdAt: string, now: Date, t: Translate): string {
  const date = new Date(createdAt)

  if (Number.isNaN(date.getTime())) {
    return t('chat.earlier')
  }

  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)

  if (dayDiff === 0) return t('chat.today')
  if (dayDiff === 1) return t('chat.yesterday')
  return dayLabelFormatter.format(date)
}

type ChatDayGroup = {
  key: string
  label: string
  messages: ChatMessage[]
}

function formatDayKey(createdAt: string): string {
  const date = new Date(createdAt)

  if (Number.isNaN(date.getTime())) {
    return 'unknown'
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function groupMessagesByDay(messages: ChatMessage[], now: Date, t: Translate): ChatDayGroup[] {
  const groups: ChatDayGroup[] = []
  const groupsByKey = new Map<string, ChatDayGroup>()

  for (const message of messages) {
    const key = formatDayKey(message.createdAt)
    const label = formatDayLabel(message.createdAt, now, t)
    const existingGroup = groupsByKey.get(key)

    if (existingGroup) {
      existingGroup.messages.push(message)
    } else {
      const group = { key, label, messages: [message] }
      groupsByKey.set(key, group)
      groups.push(group)
    }
  }

  return groups
}

function formatStorageStatus(
  note: PlaintextLocalNote,
  hasRemote: boolean,
  t: Translate,
): string {
  if (!hasRemote) {
    return t('chat.localOnly')
  }

  switch (note.syncStatus) {
    case 'synced':
      return t('chat.synced')
    case 'dirty':
      return t('chat.syncPending')
    case 'syncing':
      return t('chat.syncing')
    case 'conflict':
      return t('chat.syncConflict')
    case 'error':
      return t('chat.syncError')
  }
}

function normalizeTitle(title: string, t: Translate): string {
  return title.trim() || t('note.untitled')
}

type ChatShellProps = {
  hasRemote?: boolean
  imageResolver?: ImageSourceResolver | null
  imageSendError?: string | null
  isSendingImages?: boolean
  messages: ChatMessage[]
  note: PlaintextLocalNote
  onChangeTitle: (noteId: NoteId, title: string) => Promise<void>
  onDeleteMessage: (messageId: string) => void
  onEditMessage: (messageId: string, content: ChatMessageContent) => void
  onDismissImageError?: (() => void) | null
  onImportTelegram?: (() => void) | null
  onRequestLock: (noteId: NoteId) => void
  onSendImages?: ((
    files: File[],
    author: { side: ChatMessageSide; senderName?: string | null },
  ) => void) | null
  onSendMessage: (
    content: ChatMessageContent,
    author: { side: ChatMessageSide; senderName?: string | null },
  ) => void
  onSetMessagePinned: (messageId: string, pinned: boolean) => void
}

export function ChatShell({
  hasRemote = false,
  imageResolver = null,
  imageSendError = null,
  isSendingImages = false,
  messages,
  note,
  onChangeTitle,
  onDeleteMessage,
  onDismissImageError = null,
  onEditMessage,
  onImportTelegram = null,
  onRequestLock,
  onSendImages = null,
  onSendMessage,
  onSetMessagePinned,
}: ChatShellProps) {
  const { t } = useTranslation()
  const feedRef = useRef<HTMLDivElement>(null)
  const [titleDraft, setTitleDraft] = useState(note.title)
  const [isDragActive, setIsDragActive] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [composeSide, setComposeSide] = useState<ChatMessageSide>('self')
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [pendingDayKey, setPendingDayKey] = useState<string | null>(null)
  const [visibleLimit, setVisibleLimit] = useState(visibleMessagesStep)
  const previousCountRef = useRef(messages.length)
  const previousScrollHeightRef = useRef<number | null>(null)

  useEffect(() => {
    setTitleDraft(note.title)
    setEditingMessageId(null)
    setComposeSide('self')
    setPinnedOnly(false)
    setPendingDayKey(null)
    setSearchQuery('')
    setVisibleLimit(visibleMessagesStep)
  }, [note.id, note.title])

  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase()
  const isFiltering = pinnedOnly || normalizedSearchQuery.length > 0
  const filteredMessages = useMemo(
    () =>
      messages.filter((message) => {
        if (pinnedOnly && !message.pinnedAt) {
          return false
        }

        return (
          normalizedSearchQuery.length === 0 ||
          collectPlainText(message.content).toLocaleLowerCase().includes(normalizedSearchQuery) ||
          message.senderName?.toLocaleLowerCase().includes(normalizedSearchQuery) === true
        )
      }),
    [messages, normalizedSearchQuery, pinnedOnly],
  )
  const hiddenCount = isFiltering ? 0 : Math.max(0, filteredMessages.length - visibleLimit)
  const visibleMessages =
    hiddenCount > 0 ? filteredMessages.slice(hiddenCount) : filteredMessages
  const allFilteredGroups = useMemo(
    () => groupMessagesByDay(filteredMessages, new Date(), t),
    [filteredMessages, t],
  )
  const groups = useMemo(
    () => groupMessagesByDay(visibleMessages, new Date(), t),
    [visibleMessages, t],
  )
  const pinnedCount = useMemo(
    () => messages.filter((message) => message.pinnedAt).length,
    [messages],
  )
  const otherParticipantName = useMemo(() => {
    const counts = new Map<string, number>()

    for (const message of messages) {
      if (message.side === 'other' && message.senderName) {
        counts.set(message.senderName, (counts.get(message.senderName) ?? 0) + 1)
      }
    }

    return (
      [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ??
      t('chat.interlocutor')
    )
  }, [messages, t])
  const composeAuthor = {
    side: composeSide,
    ...(composeSide === 'other' ? { senderName: otherParticipantName } : {}),
  }

  // Jump to the newest message on open and whenever one is appended; edits
  // and deletions must not yank the scroll position.
  useEffect(() => {
    const feed = feedRef.current

    if (feed && messages.length >= previousCountRef.current) {
      feed.scrollTop = feed.scrollHeight
    }

    previousCountRef.current = messages.length
  }, [messages.length, note.id])

  useLayoutEffect(() => {
    const feed = feedRef.current
    const previousScrollHeight = previousScrollHeightRef.current

    if (!feed || previousScrollHeight === null) {
      return
    }

    feed.scrollTop += feed.scrollHeight - previousScrollHeight
    previousScrollHeightRef.current = null
  }, [visibleLimit])

  useEffect(() => {
    if (!pendingDayKey) {
      return
    }

    const target = document.getElementById(`sn-chat-day-${pendingDayKey}`)

    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setPendingDayKey(null)
    }
  }, [groups, pendingDayKey])

  function commitTitle() {
    const nextTitle = normalizeTitle(titleDraft, t)
    setTitleDraft(nextTitle)

    if (nextTitle !== note.title) {
      void onChangeTitle(note.id, nextTitle)
    }
  }

  function handleFeedDrop(event: DragEvent<HTMLDivElement>) {
    setIsDragActive(false)

    if (!onSendImages) {
      return
    }

    const files = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
      file.type.startsWith('image/'),
    )

    if (files.length === 0) {
      return
    }

    event.preventDefault()
    onSendImages(files, composeAuthor)
  }

  function showEarlierMessages() {
    previousScrollHeightRef.current = feedRef.current?.scrollHeight ?? null
    setVisibleLimit((limit) => limit + visibleMessagesStep)
  }

  const noteFingerprint =
    note.id.length > 18 ? `${note.id.slice(0, 3)}...${note.id.slice(-6)}` : note.id
  const microline = [
    noteFingerprint.toUpperCase(),
    `${messages.length} ${messages.length === 1 ? 'MESSAGE' : 'MESSAGES'}`,
    formatStorageStatus(note, hasRemote, t),
    t('chat.sealedOnLock'),
  ].join(' · ')

  return (
    <ImageSourceContext.Provider value={imageResolver}>
      <section aria-label="Chat" className="sn-chat-shell">
        <header className="sn-chat-titlebar">
          <span aria-hidden="true" className="sn-chat-titlebar__plate">
            <UiIcon name="chat" />
          </span>
          <span aria-hidden="true" className="sn-chat-titlebar__ridge" />
          <input
            aria-label={t('chat.title')}
            className="sn-chat-titlebar__title"
            onBlur={commitTitle}
            onChange={(event) => setTitleDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitTitle()
                event.currentTarget.blur()
              }
            }}
            value={titleDraft}
          />
          <span aria-hidden="true" className="sn-chat-titlebar__ridge" />
          <button
            aria-label={t('chat.lock')}
            className="sn-icon-button sn-chat-titlebar__lock"
            onClick={() => onRequestLock(note.id)}
            title={t('chat.lock')}
            type="button"
          >
            <UiIcon name="lock" />
          </button>
        </header>
        <div className="sn-chat-microline">
          <code>{microline}</code>
        </div>
        <div className="sn-chat-tools">
          <label className="sn-chat-tools__search">
            <UiIcon height={15} name="search" width={15} />
            <span className="sn-visually-hidden">Search messages</span>
            <input
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t('chat.searchMessages')}
              type="search"
              value={searchQuery}
            />
          </label>
          <button
            aria-pressed={pinnedOnly}
            className="sn-chat-tools__button"
            data-active={pinnedOnly}
            disabled={pinnedCount === 0}
            onClick={() => setPinnedOnly((current) => !current)}
            type="button"
          >
            <UiIcon height={14} name="pin" width={14} />
            Pinned {pinnedCount > 0 ? `(${pinnedCount})` : ''}
          </button>
          <label className="sn-chat-tools__date">
            <UiIcon height={14} name="calendar" width={14} />
            <span className="sn-visually-hidden">Jump to date</span>
            <select
              aria-label={t('chat.jumpToDate')}
              disabled={allFilteredGroups.length === 0}
              onChange={(event) => {
                const dayKey = event.target.value

                if (!dayKey) {
                  return
                }

                const firstMessageIndex = filteredMessages.findIndex(
                  (message) => formatDayKey(message.createdAt) === dayKey,
                )

                if (firstMessageIndex >= 0) {
                  const messagesFromTarget = filteredMessages.length - firstMessageIndex
                  setVisibleLimit((limit) => Math.max(limit, messagesFromTarget))
                  setPendingDayKey(dayKey)
                }
              }}
              value=""
            >
              <option value="">{t('chat.jumpToDate')}</option>
              {allFilteredGroups.map((group) => (
                <option key={group.key} value={group.key}>
                  {group.label}
                </option>
              ))}
            </select>
          </label>
          {onImportTelegram ? (
            <button
              className="sn-chat-tools__button"
              onClick={onImportTelegram}
              type="button"
            >
              <UiIcon height={14} name="arrowDown" width={14} />
              Import
            </button>
          ) : null}
          {isFiltering ? (
            <span aria-live="polite" className="sn-chat-tools__results">
              {filteredMessages.length} found
            </span>
          ) : null}
        </div>

        <div
          className="sn-chat-feed"
          data-drag-active={isDragActive}
          onDragEnter={(event) => {
            if (onSendImages && event.dataTransfer?.types.includes('Files')) {
              event.preventDefault()
              setIsDragActive(true)
            }
          }}
          onDragLeave={(event) => {
            const nextTarget = event.relatedTarget

            if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
              setIsDragActive(false)
            }
          }}
          onDragOver={(event) => {
            if (onSendImages) {
              event.preventDefault()
            }
          }}
          onDrop={handleFeedDrop}
          ref={feedRef}
        >
          {isDragActive ? (
            <div aria-live="polite" className="sn-chat-feed__drop-target" role="status">
              <UiIcon name="image" />
              <strong>{t('chat.dropImages')}</strong>
            </div>
          ) : null}
          {hiddenCount > 0 ? (
            <button
              className="sn-chat-feed__earlier"
              onClick={showEarlierMessages}
              type="button"
            >
              Show earlier messages ({hiddenCount})
            </button>
          ) : null}

          {messages.length === 0 ? (
            <div className="sn-chat-feed__empty">
              <span aria-hidden="true" className="sn-chat-feed__empty-plate">
                <UiIcon height={24} name="chat" width={24} />
              </span>
              <strong>{t('chat.emptyTitle')}</strong>
              <p>
                Drop thoughts, links and images here the way you would in your
                saved-messages chat.{' '}
                {hasRemote
                  ? t('chat.emptyRemote')
                  : t('chat.emptyLocal')}
              </p>
              <code>DROP · PASTE · ENTER SENDS</code>
            </div>
          ) : null}
          {messages.length > 0 && visibleMessages.length === 0 ? (
            <div className="sn-chat-feed__empty sn-chat-feed__empty--compact">
              <span aria-hidden="true" className="sn-chat-feed__empty-plate">
                <UiIcon height={24} name="search" width={24} />
              </span>
              <strong>{t('chat.noMatches')}</strong>
              <p>{t('chat.noMatchesHint')}</p>
              <button
                className="sn-chat-feed__earlier"
                onClick={() => {
                  setSearchQuery('')
                  setPinnedOnly(false)
                }}
                type="button"
              >
                Clear filters
              </button>
            </div>
          ) : null}

          {groups.map((group) => (
            <section
              className="sn-chat-day"
              id={`sn-chat-day-${group.key}`}
              key={`${group.key}-${group.messages[0]?.id}`}
            >
              <div className="sn-chat-day__chip-row">
                <span className="sn-chat-day__chip">{group.label}</span>
              </div>
              {group.messages.map((message) => (
                <ChatMessageBubble
                  isEditing={editingMessageId === message.id}
                  key={message.id}
                  message={message}
                  onCancelEdit={() => setEditingMessageId(null)}
                  onDelete={onDeleteMessage}
                  onSetPinned={onSetMessagePinned}
                  onStartEdit={setEditingMessageId}
                  onSubmitEdit={(messageId, content) => {
                    setEditingMessageId(null)
                    onEditMessage(messageId, content)
                  }}
                />
              ))}
            </section>
          ))}
        </div>

        {imageSendError || isSendingImages ? (
          <div
            aria-live="polite"
            className="sn-chat-transfer-status"
            data-tone={imageSendError ? 'error' : 'progress'}
            role={imageSendError ? 'alert' : 'status'}
          >
            <span>
              {imageSendError ?? t('chat.savingImages')}
            </span>
            {imageSendError && onDismissImageError ? (
              <button
                aria-label={t('chat.dismissImageError')}
                onClick={onDismissImageError}
                type="button"
              >
                <UiIcon height={14} name="close" width={14} />
              </button>
            ) : null}
          </div>
        ) : null}

        <footer className="sn-chat-footer">
          <div className="sn-chat-speaker-switch" role="group" aria-label={t('chat.messageAuthor')}>
            <span>{t('chat.writeAs')}</span>
            <button
              aria-pressed={composeSide === 'self'}
              data-active={composeSide === 'self'}
              onClick={() => setComposeSide('self')}
              type="button"
            >
              You
            </button>
            <button
              aria-pressed={composeSide === 'other'}
              data-active={composeSide === 'other'}
              onClick={() => setComposeSide('other')}
              type="button"
            >
              {otherParticipantName}
            </button>
          </div>
          <ChatComposer
            onPickImageFiles={
              onSendImages ? (files) => onSendImages(files, composeAuthor) : null
            }
            onSubmit={(content) => onSendMessage(content, composeAuthor)}
            placeholder={t('chat.message')}
            submitLabel={t('chat.sendMessage')}
          />
        </footer>
      </section>
    </ImageSourceContext.Provider>
  )
}
