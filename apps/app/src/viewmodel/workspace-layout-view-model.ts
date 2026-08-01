import { useCallback, useEffect, useState } from 'react'

export type MobileTab = 'notes' | 'editor' | 'details'

export type WorkspaceLayout = {
  /** Desktop wide enough for both side panels at once. */
  isCompactDesktop: boolean
  isFocusLayout: boolean
  isInspectorCollapsed: boolean
  isLibraryCollapsed: boolean
  isNarrow: boolean
  mobileTab: MobileTab
  collapseInspector(): void
  collapseLibrary(): void
  expandInspector(): void
  expandLibrary(): void
  setMobileTab(tab: MobileTab): void
  toggleFocus(): void
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia(query)
    setMatches(mediaQuery.matches)

    const handler = (event: MediaQueryListEvent) => setMatches(event.matches)
    mediaQuery.addEventListener('change', handler)

    return () => mediaQuery.removeEventListener('change', handler)
  }, [query])

  return matches
}

/**
 * Panel visibility for the workspace shell.
 *
 * A compact desktop has room for only one side panel, so the inspector there is
 * an overlay with its own open flag rather than the persistent collapse state
 * used on a wide screen. Keeping that distinction in one place stops every call
 * site from having to re-derive which of the two flags currently applies.
 */
export function useWorkspaceLayout(): WorkspaceLayout {
  const isCompact = useMediaQuery('(max-width: 1279px)')
  const isNarrow = useMediaQuery('(max-width: 959px)')
  const [isLibraryCollapsed, setLibraryCollapsed] = useState(false)
  const [isInspectorCollapsed, setInspectorCollapsed] = useState(false)
  const [isCompactInspectorOpen, setCompactInspectorOpen] = useState(false)
  const [mobileTab, setMobileTab] = useState<MobileTab>('notes')

  const isCompactDesktop = isCompact && !isNarrow
  const isInspectorEffectivelyCollapsed = isCompactDesktop
    ? !isCompactInspectorOpen
    : isInspectorCollapsed

  useEffect(() => {
    if (!isCompactDesktop) {
      setCompactInspectorOpen(false)
    }
  }, [isCompactDesktop])

  const collapseInspector = useCallback(() => {
    if (isCompactDesktop) {
      setCompactInspectorOpen(false)
    } else {
      setInspectorCollapsed(true)
    }
  }, [isCompactDesktop])

  const expandInspector = useCallback(() => {
    if (isCompactDesktop) {
      setCompactInspectorOpen(true)
    } else {
      setInspectorCollapsed(false)
    }
  }, [isCompactDesktop])

  const toggleFocus = useCallback(() => {
    const shouldFocus = !(isLibraryCollapsed && isInspectorEffectivelyCollapsed)
    setLibraryCollapsed(shouldFocus)

    if (isCompactDesktop) {
      setCompactInspectorOpen(false)
    } else {
      setInspectorCollapsed(shouldFocus)
    }
  }, [isCompactDesktop, isInspectorEffectivelyCollapsed, isLibraryCollapsed])

  return {
    collapseInspector,
    collapseLibrary: useCallback(() => setLibraryCollapsed(true), []),
    expandInspector,
    expandLibrary: useCallback(() => setLibraryCollapsed(false), []),
    isCompactDesktop,
    isFocusLayout: isLibraryCollapsed && isInspectorEffectivelyCollapsed,
    isInspectorCollapsed: isInspectorEffectivelyCollapsed,
    isLibraryCollapsed,
    isNarrow,
    mobileTab,
    setMobileTab,
    toggleFocus,
  }
}
