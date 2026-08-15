import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createDebouncedAutosave,
  type AutosaveStatus,
} from '@/ui/editor/debounced-autosave'
import { mergeAutosaveStatus } from '@/ui/editor/autosave-status'

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

  it('keeps trying after a failed save instead of abandoning the draft', async () => {
    vi.useFakeTimers()
    const onError = vi.fn()
    const save = vi
      .fn<(value: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('the disk was busy'))
      .mockResolvedValue(undefined)
    const autosave = createDebouncedAutosave<string>({
      delayMs: 450,
      onError,
      save,
    })

    autosave.schedule('the only copy')
    await vi.advanceTimersByTimeAsync(450)

    expect(save).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledOnce()
    // The draft is still the only copy of the work, so it stays shielded.
    expect(autosave.hasPending()).toBe(true)

    await vi.advanceTimersByTimeAsync(450)

    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith('the only copy')
    expect(autosave.hasPending()).toBe(false)
  })

  it('backs off between consecutive failures and caps the wait', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async () => {
      throw new Error('still failing')
    })
    const autosave = createDebouncedAutosave<string>({
      delayMs: 100,
      maxRetryDelayMs: 400,
      onError: () => undefined,
      save,
    })

    autosave.schedule('draft')

    for (const [attempt, wait] of [100, 100, 200, 400, 400].entries()) {
      await vi.advanceTimersByTimeAsync(wait)
      expect(save).toHaveBeenCalledTimes(attempt + 1)
    }

    autosave.cancel()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(save).toHaveBeenCalledTimes(5)
  })

  it('retries promptly again once the writer recovers', async () => {
    vi.useFakeTimers()
    const save = vi
      .fn<(value: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(new Error('second'))
      .mockResolvedValue(undefined)
    const autosave = createDebouncedAutosave<string>({
      delayMs: 100,
      onError: () => undefined,
      save,
    })

    autosave.schedule('draft')
    await vi.advanceTimersByTimeAsync(100)
    await vi.advanceTimersByTimeAsync(100)
    await vi.advanceTimersByTimeAsync(200)

    expect(save).toHaveBeenCalledTimes(3)
    expect(autosave.hasPending()).toBe(false)

    // The backoff must not carry over: the next edit is a fresh start.
    autosave.schedule('next edit')
    await vi.advanceTimersByTimeAsync(100)

    expect(save).toHaveBeenCalledTimes(4)
    expect(save).toHaveBeenLastCalledWith('next edit')
  })

  it('does not report a draft saved when one was typed mid-save', async () => {
    vi.useFakeTimers()
    let release: () => void = () => undefined
    const save = vi.fn<(value: string) => Promise<void>>(
      () => new Promise<void>((resolve) => { release = resolve }),
    )
    const statuses: string[] = []
    const autosave = createDebouncedAutosave<string>({
      delayMs: 100,
      onStatusChange: (status) => statuses.push(status),
      save,
    })

    autosave.schedule('first')
    await vi.advanceTimersByTimeAsync(100)
    expect(statuses).toEqual(['queued', 'saving'])

    // Typing while the write is in flight. The write that finishes a moment
    // later stored the *older* draft, so answering "saved" would be a lie —
    // and it used to be one, because the finishing save had the last word.
    autosave.schedule('second')
    await vi.advanceTimersByTimeAsync(0)

    await vi.advanceTimersByTimeAsync(0)
    release()
    await vi.advanceTimersByTimeAsync(0)

    expect(statuses).toEqual(['queued', 'saving', 'queued', 'saving'])
    expect(autosave.hasPending()).toBe(true)

    release()
    await vi.advanceTimersByTimeAsync(0)

    expect(statuses.at(-1)).toBe('idle')
    expect(save).toHaveBeenLastCalledWith('second')
  })

  it('walks the whole way from typed to saved, and back on failure', async () => {
    vi.useFakeTimers()
    const save = vi
      .fn<(value: string) => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('the disk was busy'))
      .mockResolvedValue(undefined)
    const statuses: string[] = []
    const autosave = createDebouncedAutosave<string>({
      delayMs: 100,
      onStatusChange: (status) => statuses.push(status),
      onError: () => undefined,
      save,
    })

    autosave.schedule('one')
    await vi.advanceTimersByTimeAsync(100)
    expect(statuses).toEqual(['queued', 'saving', 'idle'])

    autosave.schedule('two')
    await vi.advanceTimersByTimeAsync(100)
    expect(statuses).toEqual(['queued', 'saving', 'idle', 'queued', 'saving', 'error'])

    // The retry lands and the badge recovers without the user doing anything.
    await vi.advanceTimersByTimeAsync(100)
    expect(statuses.at(-1)).toBe('idle')
  })

  it('says nothing when nothing changed', async () => {
    vi.useFakeTimers()
    const statuses: string[] = []
    const autosave = createDebouncedAutosave<string>({
      delayMs: 100,
      onStatusChange: (status) => statuses.push(status),
      save: vi.fn(async () => undefined),
    })

    // Repeated keystrokes are all one queued draft; a status that re-announced
    // itself would re-render the badge on every character.
    autosave.schedule('a')
    autosave.schedule('ab')
    autosave.schedule('abc')

    expect(statuses).toEqual(['queued'])
  })

  it('lets an explicit flush pre-empt the backoff wait', async () => {
    vi.useFakeTimers()
    const save = vi
      .fn<(value: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue(undefined)
    const autosave = createDebouncedAutosave<string>({
      delayMs: 800,
      onError: () => undefined,
      save,
    })

    autosave.schedule('draft')
    await vi.advanceTimersByTimeAsync(800)
    expect(save).toHaveBeenCalledOnce()

    // Ctrl+S, or closing the tab: the user should not wait out the backoff.
    await autosave.flush()

    expect(save).toHaveBeenCalledTimes(2)
    expect(autosave.hasPending()).toBe(false)

    await vi.advanceTimersByTimeAsync(10_000)
    expect(save).toHaveBeenCalledTimes(2)
  })
})

describe('one badge over the document and the title', () => {
  const cases: Array<[AutosaveStatus, AutosaveStatus, string]> = [
    ['idle', 'idle', 'saved'],
    ['saving', 'idle', 'saving'],
    ['idle', 'saving', 'saving'],
    // Unsaved work outranks a write already under way: something still needs
    // saving, and the Save button has to stay reachable for it.
    ['saving', 'queued', 'queued'],
    ['queued', 'saving', 'queued'],
    ['queued', 'idle', 'queued'],
    // A failure is the one thing the reader has to act on.
    ['error', 'queued', 'error'],
    ['idle', 'error', 'error'],
    ['error', 'saving', 'error'],
  ]

  for (const [documentStatus, titleStatus, expected] of cases) {
    it(`reads ${expected} when the document is ${documentStatus} and the title is ${titleStatus}`, () => {
      expect(mergeAutosaveStatus(documentStatus, titleStatus)).toBe(expected)
    })
  }
})
