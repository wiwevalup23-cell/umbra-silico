import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage, ChatMessageContent } from '@/shared/contracts'
import { ChatMessageBubble, ChatMessageContentView } from '@/ui/components/chat'

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
    const onStartEdit = vi.fn()
    const message: ChatMessage = {
      id: 'message-1',
      createdAt: '2026-07-20T00:00:00.000Z',
      editedAt: null,
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Saved thought' }] }],
    }
    const container = renderUi(
      <ChatMessageBubble
        isEditing={false}
        message={message}
        onCancelEdit={vi.fn()}
        onDelete={onDelete}
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
})
