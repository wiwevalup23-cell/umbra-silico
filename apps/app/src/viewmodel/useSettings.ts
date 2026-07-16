import { useState, useEffect, useCallback } from 'react'
import { allowedBackgroundImages } from '@/shared/backgrounds'

type AppSettings = {
  zoomScale: number
  backgroundImage: string | null
  sidebarWidth: number
  inspectorWidth: number
}

const DEFAULT_SETTINGS: AppSettings = {
  zoomScale: 1,
  backgroundImage: null,
  sidebarWidth: 260,
  inspectorWidth: 240,
}

const SETTINGS_KEY = 'umbra-silico-settings'
const MIN_ZOOM_SCALE = 0.9
const MAX_ZOOM_SCALE = 1.15
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
    zoomScale: clamp(
      Number(value.zoomScale ?? DEFAULT_SETTINGS.zoomScale),
      MIN_ZOOM_SCALE,
      MAX_ZOOM_SCALE,
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

    // Zoom scale applied to body
    document.body.style.zoom = String(settings.zoomScale)
    if (settings.backgroundImage) {
      root.style.setProperty('--sn-user-background-image', `url("${settings.backgroundImage}")`)
    } else {
      root.style.removeProperty('--sn-user-background-image')
    }

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
