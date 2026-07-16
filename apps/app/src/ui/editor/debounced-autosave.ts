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

  function clearTimer() {
    if (timeout) {
      clearTimeout(timeout)
      timeout = null
    }
  }

  async function flush() {
    clearTimer()

    if (!pending) {
      return
    }

    const value = pendingValue as TValue
    pendingValue = null
    pending = false

    try {
      await save(value)
    } catch (error) {
      onError?.(error)
    }
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
