import { useEffect, useState } from 'react'

export const searchDebounceMs = 180

/**
 * Trails `value` by `delayMs` of quiet.
 *
 * Search reads note bodies out of the local store, which is a full scan on
 * IndexedDB. Feeding every keystroke straight into the query would run that
 * scan per character; debouncing keeps the input itself instant and runs one
 * scan per pause instead.
 */
export function useDebouncedValue<TValue>(value: TValue, delayMs: number): TValue {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    if (Object.is(value, debouncedValue)) {
      return undefined
    }

    const timeout = setTimeout(() => setDebouncedValue(value), delayMs)

    return () => clearTimeout(timeout)
    // debouncedValue is read only to skip a no-op timer; reacting to it would
    // restart the delay every time the debounced value catches up.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [value, delayMs])

  return debouncedValue
}
