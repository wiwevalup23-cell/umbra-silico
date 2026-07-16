import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDebouncedAutosave } from '@/ui/editor'

afterEach(() => {
  vi.useRealTimers()
})

describe('editor debounced autosave', () => {
  it('saves only the latest scheduled value after the debounce window', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async () => undefined)
    const autosave = createDebouncedAutosave<string>({
      delayMs: 450,
      save,
    })

    autosave.schedule('first')
    autosave.schedule('second')

    await vi.advanceTimersByTimeAsync(449)
    expect(save).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledWith('second')
    expect(autosave.hasPending()).toBe(false)
  })

  it('flushes a pending value immediately', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async () => undefined)
    const autosave = createDebouncedAutosave<string>({
      delayMs: 450,
      save,
    })

    autosave.schedule('now')
    await autosave.flush()

    expect(save).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledWith('now')

    await vi.advanceTimersByTimeAsync(450)
    expect(save).toHaveBeenCalledOnce()
  })
})
