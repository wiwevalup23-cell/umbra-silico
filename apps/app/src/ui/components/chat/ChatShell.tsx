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
  ImageSourceResolver,
  NoteId,
  PlaintextLocalNote,
} from '@/shared/contracts'
import { ImageSourceContext } from '@/ui/editor/image-source-context'
import { UiIcon } from '@/ui/icons/ui/UiIcon'
import { ChatComposer } from '@/ui/components/chat/ChatComposer'
import { ChatMessageBubble } from '@/ui/components/chat/ChatMessageBubble'

const visibleMessagesStep = 100

const dayLabelFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function formatDayLabel(createdAt: string, now: Date): string {
  const date = new Date(createdAt)

  if (Number.isNaN(date.getTime())) {
    return 'Earlier'
  }

  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)

  if (dayDiff === 0) return 'Today'
  if (dayDiff === 1) return 'Yesterday'
  return dayLabelFormatter.format(date)
}

type ChatDayGroup = {
  label: string
  messages: ChatMessage[]
}

function groupMessagesByDay(messages: ChatMessage[], now: Date): ChatDayGroup[] {
  const groups: ChatDayGroup[] = []

  for (const message of messages) {
    const label = formatDayLabel(message.createdAt, now)
    const lastGroup = groups[groups.length - 1]

    if (lastGroup && lastGroup.label === label) {
      lastGroup.messages.push(message)
    } else {
      groups.push({ label, messages: [message] })
    }
  }

  return groups
}

function normalizeTitle(title: string): string {
  return title.trim() || 'Untitled'
}

type ChatShellProps = {
  imageResolver?: ImageSourceResolver | null
  messages: ChatMessage[]
  note: PlaintextLocalNote
  onChangeTitle: (noteId: NoteId, title: string) => Promise<void>
  onDeleteMessage: (messageId: string) => void
  onEditMessage: (messageId: string, content: ChatMessageContent) => void
  onRequestLock: (noteId: NoteId) => void
  onSendImages?: ((files: File[]) => void) | null
  onSendMessage: (content: ChatMessageContent) => void
}

export function ChatShell({
  imageResolver = null,
  messages,
  note,
  onChangeTitle,
  onDeleteMessage,
  onEditMessage,
  onRequestLock,
  onSendImages = null,
  onSendMessage,
}: ChatShellProps) {
  const feedRef = useRef<HTMLDivElement>(null)
  const [titleDraft, setTitleDraft] = useState(note.title)
  const [isDragActive, setIsDragActive] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [visibleLimit, setVisibleLimit] = useState(visibleMessagesStep)
  const previousCountRef = useRef(messages.length)
  const previousScrollHeightRef = useRef<number | null>(null)

  useEffect(() => {
    setTitleDraft(note.title)
    setEditingMessageId(null)
    setVisibleLimit(visibleMessagesStep)
  }, [note.id, note.title])

  const hiddenCount = Math.max(0, messages.length - visibleLimit)
  const visibleMessages = hiddenCount > 0 ? messages.slice(hiddenCount) : messages
  const groups = useMemo(
    () => groupMessagesByDay(visibleMessages, new Date()),
    [visibleMessages],
  )

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

  function commitTitle() {
    const nextTitle = normalizeTitle(titleDraft)
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
    onSendImages(files)
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
    'LOCAL ONLY',
    'SEALED ON LOCK',
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
            aria-label="Chat title"
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
            aria-label="Lock this chat"
            className="sn-icon-button sn-chat-titlebar__lock"
            onClick={() => onRequestLock(note.id)}
            title="Lock this chat"
            type="button"
          >
            <UiIcon name="lock" />
          </button>
        </header>
        <div className="sn-chat-microline">
          <code>{microline}</code>
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
              <strong>Drop images to save them here</strong>
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
              <strong>Your private stream</strong>
              <p>
                Drop thoughts, links and images here the way you would in your
                saved-messages chat. Everything stays local to this device.
              </p>
              <code>DROP · PASTE · ENTER SENDS</code>
            </div>
          ) : null}

          {groups.map((group) => (
            <section className="sn-chat-day" key={`${group.label}-${group.messages[0]?.id}`}>
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

        <footer className="sn-chat-footer">
          <ChatComposer
            onPickImageFiles={onSendImages}
            onSubmit={onSendMessage}
            placeholder="Message"
            submitLabel="Send message"
          />
        </footer>
      </section>
    </ImageSourceContext.Provider>
  )
}
