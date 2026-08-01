import {
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type DependencyList,
} from 'react'
import type { LiveQuery } from '@/repository/contracts'

export function createStaticLiveQuery<TValue>(value: TValue): LiveQuery<TValue> {
  return {
    dispose: () => undefined,
    getSnapshot: () => value,
    retain: () => undefined,
    subscribe: () => () => undefined,
  }
}

/**
 * Creates a repository live query and releases it when the inputs change or
 * the component unmounts. Without the release the repository would keep
 * re-running every query a session ever created on every later write.
 */
export function useOwnedLiveQuery<TValue>(
  create: () => LiveQuery<TValue>,
  dependencies: DependencyList,
): LiveQuery<TValue> {
  // The dependency array belongs to the caller's `create`, so it is checked at
  // the call sites (see react/exhaustive-deps additionalHooks) rather than
  // here, where the pass-through is opaque to the rule by construction.
  // oxlint-disable-next-line react/exhaustive-deps
  const query = useMemo(create, dependencies)

  useEffect(() => {
    // React may tear an effect down and mount it again with the same memoized
    // value — StrictMode does exactly that. Retaining on mount brings a query
    // released by the previous teardown back into service instead of leaving
    // the component bound to a dead one.
    query.retain()

    return () => query.dispose()
  }, [query])

  return query
}

export function useLiveQuery<TValue>(query: LiveQuery<TValue>): TValue {
  const subscribe = useCallback(
    (listener: () => void) => query.subscribe(listener),
    [query],
  )
  const getSnapshot = useCallback(() => query.getSnapshot(), [query])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
