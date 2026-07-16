import { useCallback, useSyncExternalStore } from 'react'
import type { LiveQuery } from '@/repository/contracts'

export function createStaticLiveQuery<TValue>(value: TValue): LiveQuery<TValue> {
  return {
    getSnapshot: () => value,
    subscribe: () => () => undefined,
  }
}

export function useLiveQuery<TValue>(query: LiveQuery<TValue>): TValue {
  const subscribe = useCallback(
    (listener: () => void) => query.subscribe(listener),
    [query],
  )
  const getSnapshot = useCallback(() => query.getSnapshot(), [query])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
