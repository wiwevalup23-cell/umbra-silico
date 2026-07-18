export type DebouncedAutosaveOptions<TValue> = {
  delayMs: number
  onError?: (error: unknown) => void
  save(value: TValue): Promise<void> | void
}

export type DebouncedAutosave<TValue> = {
  cancel(): void
  flush(): Promise<void>
  hasPending(): boolean
  schedule(value: TValue): void
}

export function createDebouncedAutosave<TValue>({
  delayMs,
  onError,
  save,
}: DebouncedAutosaveOptions<TValue>): DebouncedAutosave<TValue> {
  let timeout: ReturnType<typeof setTimeout> | null = null
  let pendingValue: TValue | null = null
  let pending = false
  let inFlightFlush: Promise<void> | null = null

  function clearTimer() {
    if (timeout) {
      clearTimeout(timeout)
      timeout = null
    }
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
        return
      }

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
    },
    flush,
    hasPending() {
      return pending
    },
    schedule(value) {
      pendingValue = value
      pending = true
      clearTimer()
      timeout = setTimeout(() => {
        void flush()
      }, delayMs)
    },
  }
}
