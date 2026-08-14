import { readFileSync } from 'node:fs'
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createChatDocument,
  createDraftLocalNote,
  deviceIdSchema,
  noteIdSchema,
  userIdSchema,
  type ChatMessage,
  type ChatMessageContent,
} from '@/shared/contracts'
import { ChatMessageBubble, ChatMessageContentView, ChatShell } from '@/ui/components/chat'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const cleanupTasks: Array<() => void> = []

function renderUi(children: ReactNode) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  act(() => root.render(children))

  cleanupTasks.push(() => {
    act(() => root.unmount())
    container.remove()
  })

  return container
}

afterEach(() => {
  while (cleanupTasks.length > 0) {
    cleanupTasks.pop()?.()
  }
})

describe('saved messages UI', () => {
  it('keeps secondary chat tools behind an equal-sized titlebar control', () => {
    const now = '2026-07-20T00:00:00.000Z'
    const note = createDraftLocalNote({
      deviceId: deviceIdSchema.parse('device-chat-ui'),
      document: createChatDocument(),
      id: noteIdSchema.parse('note-chat-ui'),
      now,
      properties: { kind: 'chat', markers: [], status: 'none', tags: [] },
      title: 'Dance Macabre',
      userId: userIdSchema.parse('user-chat-ui'),
    })
    const container = renderUi(
      <ChatShell
        messages={[]}
        note={note}
        onChangeTitle={vi.fn(async () => undefined)}
        onDeleteMessage={vi.fn()}
        onEditMessage={vi.fn()}
        onImportTelegram={vi.fn()}
        onRequestLock={vi.fn()}
        onSendMessage={vi.fn()}
        onSetMessagePinned={vi.fn()}
      />,
    )
    const toolsButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Chat tools"]',
    )
    const lockButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Lock this chat"]',
    )

    expect(toolsButton?.classList.contains('sn-chat-titlebar__control')).toBe(true)
    expect(lockButton?.classList.contains('sn-chat-titlebar__control')).toBe(true)
    expect(container.querySelector('.sn-chat-tools')).toBeNull()

    act(() => toolsButton?.click())

    expect(toolsButton?.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelector('[role="region"][aria-label="Chat tools"]')).not.toBeNull()
    expect(container.querySelector('input[placeholder="Search messages"]')).not.toBeNull()

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })

    expect(toolsButton?.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('.sn-chat-tools')).toBeNull()
  })

  it('keeps date markers quiet and centers composer controls with its input', () => {
    const css = readFileSync(`${process.cwd()}/src/ui/styles/chat.css`, 'utf8')
    const titlebarControlRule = css.match(/\.sn-chat-titlebar__control \{([\s\S]*?)\n\}/)?.[1]
    const dateChipRule = css.match(/\.sn-chat-day__chip \{([\s\S]*?)\n\}/)?.[1]
    const composerRule = css.match(/\.sn-chat-composer \{([\s\S]*?)\n\}/)?.[1]

    expect(titlebarControlRule).toMatch(/width:\s*38px/)
    expect(titlebarControlRule).toMatch(/height:\s*38px/)
    expect(dateChipRule).toMatch(/border:\s*1px solid rgba\(28, 27, 24, 0\.14\)/)
    expect(dateChipRule).toMatch(/color:\s*var\(--sn-muted-2\)/)
    expect(dateChipRule).toMatch(/font-size:\s*9px/)
    expect(composerRule).toMatch(/align-items:\s*center/)
  })

  it('renders persisted text styles, marker colors and KaTeX without live editors', () => {
    const content: ChatMessageContent = [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Remember ',
            marks: [
              {
                type: 'textStyle',
                attrs: { fontFamily: 'Lora Variable', fontSize: '20px' },
              },
              { type: 'highlight', attrs: { color: '#f3df84' } },
            ],
          },
          { type: 'inlineMath', attrs: { latex: 'E = mc^2' } },
        ],
      },
    ]
    const container = renderUi(<ChatMessageContentView content={content} />)
    const styledText = container.querySelector<HTMLElement>('mark > span')

    expect(styledText?.style.fontFamily).toBe('"Lora Variable"')
    expect(styledText?.style.fontSize).toBe('20px')
    expect(styledText?.parentElement?.style.backgroundColor).toBe('rgb(243, 223, 132)')
    expect(container.querySelector('.sn-chat-message__math .katex')).not.toBeNull()
  })

  it('exposes touch-friendly message actions from a single menu', () => {
    const onDelete = vi.fn()
    const onSetPinned = vi.fn()
    const onStartEdit = vi.fn()
    const message: ChatMessage = {
      id: 'message-1',
      createdAt: '2026-07-20T00:00:00.000Z',
      editedAt: null,
      pinnedAt: null,
      side: 'self',
      senderName: null,
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Saved thought' }] }],
    }
    const container = renderUi(
      <ChatMessageBubble
        isEditing={false}
        message={message}
        onCancelEdit={vi.fn()}
        onDelete={onDelete}
        onSetPinned={onSetPinned}
        onStartEdit={onStartEdit}
        onSubmitEdit={vi.fn()}
      />,
    )

    act(() => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Message actions"]')?.click()
    })

    expect(container.textContent).toContain('Copy text')
    expect(container.textContent).toContain('Edit')
    expect(container.textContent).toContain('Delete')

    act(() => {
      Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => button.textContent?.includes('Edit'))
        ?.click()
    })

    expect(onStartEdit).toHaveBeenCalledWith('message-1')
  })

  it('requires explicit confirmation before deleting a message', () => {
    const onDelete = vi.fn()
    const message: ChatMessage = {
      id: 'message-delete',
      createdAt: '2026-07-20T00:00:00.000Z',
      editedAt: null,
      pinnedAt: null,
      side: 'self',
      senderName: null,
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep me safe' }] }],
    }
    const container = renderUi(
      <ChatMessageBubble
        isEditing={false}
        message={message}
        onCancelEdit={vi.fn()}
        onDelete={onDelete}
        onSetPinned={vi.fn()}
        onStartEdit={vi.fn()}
        onSubmitEdit={vi.fn()}
      />,
    )

    act(() => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Message actions"]')?.click()
    })
    act(() => {
      Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => button.textContent?.trim() === 'Delete')
        ?.click()
    })

    expect(onDelete).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Delete this message?')

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Confirm message deletion"] button:last-child')
        ?.click()
    })

    expect(onDelete).toHaveBeenCalledWith('message-delete')
  })

  it('renders an interlocutor message on the opposite side with its sender name', () => {
    const message: ChatMessage = {
      id: 'message-other',
      createdAt: '2026-07-20T00:00:00.000Z',
      editedAt: null,
      pinnedAt: null,
      senderName: 'Kitchen Friend',
      side: 'other',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
    }
    const container = renderUi(
      <ChatMessageBubble
        isEditing={false}
        message={message}
        onCancelEdit={vi.fn()}
        onDelete={vi.fn()}
        onSetPinned={vi.fn()}
        onStartEdit={vi.fn()}
        onSubmitEdit={vi.fn()}
      />,
    )
    const bubble = container.querySelector<HTMLElement>('.sn-chat-bubble')

    expect(bubble?.dataset.side).toBe('other')
    expect(bubble?.querySelector('.sn-chat-bubble__sender')?.textContent).toBe(
      'Kitchen Friend',
    )
  })
})
