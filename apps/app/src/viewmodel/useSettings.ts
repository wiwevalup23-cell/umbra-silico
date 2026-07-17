import { useState, useEffect, useCallback } from 'react'
import {
  allowedBackgroundImages,
  allowedBackgroundPatterns,
  type BackgroundPattern,
} from '@/shared/backgrounds'

type AppSettings = {
  backgroundImage: string | null
  backgroundPattern: BackgroundPattern
  backgroundOpacity: number
  sidebarWidth: number
  inspectorWidth: number
}

const DEFAULT_SETTINGS: AppSettings = {
  backgroundImage: null,
  backgroundPattern: 'grid',
  backgroundOpacity: 100,
  sidebarWidth: 260,
  inspectorWidth: 240,
}

const MIN_BACKGROUND_OPACITY = 0
const MAX_BACKGROUND_OPACITY = 100

// Matches --sn-bg (#edeae2), so the scrim fades the panel toward its own
// base color instead of toward black/white.
const BACKGROUND_BASE_RGB = '237, 234, 226'

const SETTINGS_KEY = 'umbra-silico-settings'
const MIN_SIDEBAR_WIDTH = 250
const MAX_SIDEBAR_WIDTH = 350
const MIN_INSPECTOR_WIDTH = 200
const MAX_INSPECTOR_WIDTH = 300

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeSettings(value: Partial<AppSettings>): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    backgroundImage:
      typeof value.backgroundImage === 'string' && allowedBackgroundImages.has(value.backgroundImage)
        ? value.backgroundImage
        : value.backgroundImage === null
        ? value.backgroundImage
        : DEFAULT_SETTINGS.backgroundImage,
    backgroundPattern:
      typeof value.backgroundPattern === 'string' &&
      allowedBackgroundPatterns.has(value.backgroundPattern as BackgroundPattern)
        ? (value.backgroundPattern as BackgroundPattern)
        : DEFAULT_SETTINGS.backgroundPattern,
    backgroundOpacity: clamp(
      Number(value.backgroundOpacity ?? DEFAULT_SETTINGS.backgroundOpacity),
      MIN_BACKGROUND_OPACITY,
      MAX_BACKGROUND_OPACITY,
    ),
    inspectorWidth: clamp(
      Number(value.inspectorWidth ?? DEFAULT_SETTINGS.inspectorWidth),
      MIN_INSPECTOR_WIDTH,
      MAX_INSPECTOR_WIDTH,
    ),
    sidebarWidth: clamp(
      Number(value.sidebarWidth ?? DEFAULT_SETTINGS.sidebarWidth),
      MIN_SIDEBAR_WIDTH,
      MAX_SIDEBAR_WIDTH,
    ),
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS
    try {
      const stored = window.localStorage.getItem(SETTINGS_KEY)
      return stored ? normalizeSettings(JSON.parse(stored)) : DEFAULT_SETTINGS
    } catch {
      return DEFAULT_SETTINGS
    }
  })

  // Sync settings to localStorage whenever they change
  useEffect(() => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  }, [settings])

  // Apply settings to CSS variables on :root
  useEffect(() => {
    const root = document.documentElement

    if (settings.backgroundImage) {
      root.style.setProperty('--sn-user-background-image', `url("${settings.backgroundImage}")`)
    } else {
      root.style.removeProperty('--sn-user-background-image')
    }

    if (settings.backgroundPattern === 'scanlines') {
      root.style.setProperty(
        '--sn-background-pattern-y',
        'linear-gradient(rgba(28, 27, 24, 0.16) 1px, transparent 1px)',
      )
      root.style.setProperty('--sn-background-pattern-x', 'none')
      root.style.setProperty('--sn-background-pattern-size', '100% 3px')
    } else if (settings.backgroundPattern === 'none') {
      root.style.setProperty('--sn-background-pattern-y', 'none')
      root.style.setProperty('--sn-background-pattern-x', 'none')
      root.style.setProperty('--sn-background-pattern-size', '24px 24px')
    } else {
      root.style.removeProperty('--sn-background-pattern-y')
      root.style.removeProperty('--sn-background-pattern-x')
      root.style.removeProperty('--sn-background-pattern-size')
    }

    const opacity = settings.backgroundOpacity / 100
    // background-image layers must each resolve to an <image>, so the scrim
    // color is wrapped in a flat linear-gradient rather than used bare.
    root.style.setProperty(
      '--sn-background-scrim',
      `linear-gradient(rgba(${BACKGROUND_BASE_RGB}, ${1 - opacity}), rgba(${BACKGROUND_BASE_RGB}, ${1 - opacity}))`,
    )

    root.style.setProperty('--sidebar-width', `${settings.sidebarWidth}px`)
    root.style.setProperty('--inspector-width', `${settings.inspectorWidth}px`)
  }, [settings])

  const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => normalizeSettings({ ...prev, [key]: value }))
  }, [])

  return {
    settings,
    updateSetting,
  }
}
