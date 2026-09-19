import { useCallback, useEffect, useState } from 'react'

export type MobileTab = 'notes' | 'editor' | 'details'

type PanelPreferences = {
  isLibraryCollapsed: boolean
  isInspectorCollapsed: boolean
}

const panelStorageKey = 'umbra.workspace.panels.v1'
const defaultPanels: PanelPreferences = {
  isLibraryCollapsed: false,
  isInspectorCollapsed: false,
}

function readPanelPreferences(): PanelPreferences {
  try {
    const value = JSON.parse(window.localStorage.getItem(panelStorageKey) ?? 'null')
    if (typeof value?.isLibraryCollapsed === 'boolean' &&
        typeof value?.isInspectorCollapsed === 'boolean') {
      return {
        isLibraryCollapsed: value.isLibraryCollapsed,
        isInspectorCollapsed: value.isInspectorCollapsed,
      }
    }
  } catch { /* Storage may be unavailable; keep the in-session layout working. */ }
  return defaultPanels
}

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
  const [panels, setPanels] = useState(readPanelPreferences)
  // Focus temporarily hides the panels without overwriting the user's layout.
  const [isFocusLayout, setFocusLayout] = useState(false)
  const [isCompactInspectorOpen, setCompactInspectorOpen] = useState(false)
  const [mobileTab, setMobileTab] = useState<MobileTab>('notes')

  const isCompactDesktop = isCompact && !isNarrow
  const isInspectorEffectivelyCollapsed = isFocusLayout || (isCompactDesktop
    ? !isCompactInspectorOpen
    : panels.isInspectorCollapsed)

  useEffect(() => {
    try {
      window.localStorage.setItem(panelStorageKey, JSON.stringify(panels))
    } catch { /* A storage failure must not prevent opening a panel. */ }
  }, [panels])

  useEffect(() => {
    if (!isCompactDesktop) {
      setCompactInspectorOpen(false)
    }
  }, [isCompactDesktop])

  const collapseInspector = useCallback(() => {
    setFocusLayout(false)
    if (isCompactDesktop) {
      setCompactInspectorOpen(false)
    } else {
      setPanels((previous) => ({ ...previous, isInspectorCollapsed: true }))
    }
  }, [isCompactDesktop])

  const expandInspector = useCallback(() => {
    setFocusLayout(false)
    if (isCompactDesktop) {
      setCompactInspectorOpen(true)
    } else {
      setPanels((previous) => ({ ...previous, isInspectorCollapsed: false }))
    }
  }, [isCompactDesktop])

  const toggleFocus = useCallback(() => {
    setFocusLayout((focused) => !focused)
    setCompactInspectorOpen(false)
  }, [])

  return {
    collapseInspector,
    collapseLibrary: useCallback(() => {
      setFocusLayout(false)
      setPanels((previous) => ({ ...previous, isLibraryCollapsed: true }))
    }, []),
    expandInspector,
    expandLibrary: useCallback(() => {
      setFocusLayout(false)
      setPanels((previous) => ({ ...previous, isLibraryCollapsed: false }))
    }, []),
    isCompactDesktop,
    isFocusLayout,
    isInspectorCollapsed: isInspectorEffectivelyCollapsed,
    isLibraryCollapsed: isFocusLayout || panels.isLibraryCollapsed,
    isNarrow,
    mobileTab,
    setMobileTab,
    toggleFocus,
  }
}
