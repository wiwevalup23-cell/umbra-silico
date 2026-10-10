import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { noteIdSchema } from '@/shared'
import { LockModal } from '@/ui/components/notes'
import { TranslationProvider } from '@/ui/i18n/TranslationProvider'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const cleanupTasks: Array<() => void> = []
const noteId = noteIdSchema.parse('note_lock_guidance')

function renderUi(children: ReactNode, locale: 'en' | 'ru' = 'en') {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const render = (node: ReactNode) =>
    act(() => root.render(<TranslationProvider locale={locale}>{node}</TranslationProvider>))

  render(children)
  cleanupTasks.push(() => {
    act(() => root.unmount())
    container.remove()
  })

  return { container, rerender: render }
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function fields(container: HTMLElement) {
  return {
    password: container.querySelector<HTMLInputElement>('#sn-lock-password')!,
    confirmation: container.querySelector<HTMLInputElement>('#sn-lock-password-confirmation'),
    submit: container.querySelector<HTMLButtonElement>('button[type="submit"]')!,
  }
}

afterEach(() => {
  while (cleanupTasks.length) cleanupTasks.pop()?.()
})

describe('lock dialog guidance', () => {
  it('says how many characters a short password still needs', () => {
    const { container } = renderUi(
      <LockModal mode="lock" noteId={noteId} onClose={vi.fn()} onSubmit={vi.fn()} />,
      'ru',
    )
    const { password, submit } = fields(container)

    // Nothing typed yet: the placeholder already says "at least 8".
    expect(container.querySelector('#sn-lock-password-length')).toBeNull()

    act(() => setInputValue(password, 'abc'))
    expect(container.querySelector('#sn-lock-password-length')?.textContent).toBe(
      'Ещё 5 символов — пароль должен быть не короче 8',
    )
    expect(password.getAttribute('aria-describedby')).toContain('sn-lock-password-length')
    expect(submit.disabled).toBe(true)

    act(() => setInputValue(password, 'abcdefg'))
    expect(container.querySelector('#sn-lock-password-length')?.textContent).toBe(
      'Ещё 1 символ — пароль должен быть не короче 8',
    )

    act(() => setInputValue(password, 'abcdefgh'))
    expect(container.querySelector('#sn-lock-password-length')).toBeNull()
  })

  it('waits for the confirmation to diverge or be left before calling it a mismatch', () => {
    const { container } = renderUi(
      <LockModal mode="lock" noteId={noteId} onClose={vi.fn()} onSubmit={vi.fn()} />,
      'ru',
    )
    const { confirmation, password, submit } = fields(container)

    act(() => setInputValue(password, 'correct-horse'))
    act(() => setInputValue(confirmation!, 'correct'))
    expect(container.querySelector('#sn-lock-password-mismatch')).toBeNull()
    expect(submit.disabled).toBe(true)

    act(() => setInputValue(confirmation!, 'correcx'))
    expect(container.querySelector('#sn-lock-password-mismatch')?.textContent).toBe(
      'Пароли не совпадают.',
    )

    // A matching prefix left behind is a mismatch after all.
    act(() => setInputValue(confirmation!, 'correct'))
    expect(container.querySelector('#sn-lock-password-mismatch')).toBeNull()
    act(() => {
      confirmation!.focus()
      confirmation!.blur()
    })
    expect(container.querySelector('#sn-lock-password-mismatch')).not.toBeNull()

    act(() => setInputValue(confirmation!, 'correct-horse'))
    expect(container.querySelector('#sn-lock-password-mismatch')).toBeNull()
    expect(submit.disabled).toBe(false)
  })

  it('words refusals in the reader’s language and never shows an empty error', () => {
    const { container, rerender } = renderUi(
      <LockModal
        error={{ kind: 'wrong-password' }}
        mode="unlock"
        noteId={noteId}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
      'ru',
    )
    const alert = () => container.querySelector('[role="alert"]')?.textContent

    expect(alert()).toBe('Пароль не подходит. Проверьте раскладку и Caps Lock.')

    rerender(
      <LockModal
        error={{ kind: 'wrong-password' }}
        mode="lock"
        noteId={noteId}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )
    expect(alert()).toContain('Это не мастер-пароль.')

    rerender(
      <LockModal
        error={{ kind: 'wrong-recovery-key' }}
        mode="unlock"
        noteId={noteId}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )
    expect(alert()).toBe('Ключ восстановления не подходит. Проверьте, что он введён полностью.')

    rerender(
      <LockModal
        error={{ kind: 'failed' }}
        mode="unlock"
        noteId={noteId}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )
    expect(alert()).toBe('Не удалось разблокировать заметку. Попробуйте ещё раз.')
    expect(container.textContent).toContain('Отмена')
    expect(container.textContent).not.toContain('Cancel')
  })

  it('puts the person back in the password field after a refusal', () => {
    const { container, rerender } = renderUi(
      <LockModal isPending mode="unlock" noteId={noteId} onClose={vi.fn()} onSubmit={vi.fn()} />,
    )
    const { password } = fields(container)
    password.blur()

    rerender(
      <LockModal
        error={{ kind: 'wrong-password' }}
        mode="unlock"
        noteId={noteId}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(document.activeElement).toBe(password)
    expect(password.getAttribute('aria-invalid')).toBe('true')
  })
})
