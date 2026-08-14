export type DebouncedAutosaveOptions<TValue> = {
  delayMs: number
  /** Ceiling for the retry backoff after a failed save. */
  maxRetryDelayMs?: number
  onError?: (error: unknown) => void
  save(value: TValue): Promise<void> | void
}

const defaultMaxRetryDelayMs = 30_000

export type DebouncedAutosave<TValue> = {
  cancel(): void
  flush(): Promise<void>
  hasPending(): boolean
  schedule(value: TValue): void
}

export function createDebouncedAutosave<TValue>({
  delayMs,
  maxRetryDelayMs = defaultMaxRetryDelayMs,
  onError,
  save,
}: DebouncedAutosaveOptions<TValue>): DebouncedAutosave<TValue> {
  let timeout: ReturnType<typeof setTimeout> | null = null
  let pendingValue: TValue | null = null
  let pending = false
  let inFlightFlush: Promise<void> | null = null
  let retryDelayMs = delayMs

  function clearTimer() {
    if (timeout) {
      clearTimeout(timeout)
      timeout = null
    }
  }

  function armTimer(delay: number) {
    clearTimer()
    timeout = setTimeout(() => {
      void flush()
    }, delay)
  }

  // `pending` stays true until the save has actually landed: the editor's
  // echo-suppression relies on hasPending() to shield unsaved content, so
  // clearing it before (or despite a failed) save opens a window where a
  // live-query echo could roll the editor back and drop the draft.
  async function runFlush() {
    while (pending) {
      const value = pendingValue as TValue

      try {
        await save(value)
      } catch (error) {
        onError?.(error)

        // Staying pending is right — the draft is still the only copy of the
        // work. Staying pending and *stopping* was not: nothing rearmed the
        // timer, so one transient failure left the note unsaved for the rest
        // of the session behind an error badge, and `hasPending()` answered
        // true forever, which is what the editor consults before accepting an
        // incoming document. Keep trying, with room between attempts.
        armTimer(retryDelayMs)
        retryDelayMs = Math.min(retryDelayMs * 2, maxRetryDelayMs)
        return
      }

      retryDelayMs = delayMs

      // Clear only when no newer draft arrived while the save was in flight.
      if (pendingValue === value) {
        pendingValue = null
        pending = false
      }
    }
  }

  function flush(): Promise<void> {
    clearTimer()

    if (!inFlightFlush) {
      inFlightFlush = runFlush().finally(() => {
        inFlightFlush = null
      })
    }

    return inFlightFlush
  }

  return {
    cancel() {
      clearTimer()
      pendingValue = null
      pending = false
      retryDelayMs = delayMs
    },
    flush,
    hasPending() {
      return pending
    },
    schedule(value) {
      pendingValue = value
      pending = true
      // Fresh keystrokes deserve a prompt attempt, whatever the last one cost.
      retryDelayMs = delayMs
      armTimer(delayMs)
    },
  }
}
