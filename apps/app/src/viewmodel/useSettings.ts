import { useEffect } from 'react'
import { create } from 'zustand'
import {
  allowedBackgroundImages,
  allowedBackgroundPatterns,
  customBackgroundValue,
  type BackgroundPattern,
} from '@/shared/backgrounds'
import { detectLocale, isLocale, type Locale } from '@/shared/i18n'
import {
  loadCustomBackground,
  useCustomBackgroundUrl,
} from '@/viewmodel/custom-background-view-model'

type AppSettings = {
  locale: Locale
  backgroundImage: string | null
  backgroundPattern: BackgroundPattern
  backgroundOpacity: number
  sidebarWidth: number
  inspectorWidth: number
}

const DEFAULT_SETTINGS: AppSettings = {
  // Guessed from the browser on first run, then whatever the user picked.
  locale: detectLocale(),
  backgroundImage: null,
  backgroundPattern: 'grid',
  backgroundOpacity: 55,
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
    locale: isLocale(value.locale) ? value.locale : DEFAULT_SETTINGS.locale,
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

function readStoredSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS

  try {
    const stored = window.localStorage.getItem(SETTINGS_KEY)
    return stored ? normalizeSettings(JSON.parse(stored)) : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

type SettingsState = {
  settings: AppSettings
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}

/**
 * Settings are shared, not per-component.
 *
 * They used to live in a `useState` inside this hook, which gave every caller
 * its own private copy: changing the language in the settings dialog left the
 * workspace on the old one. Background settings hid the problem because they
 * are written straight onto :root as a side effect.
 */
const useSettingsStore = create<SettingsState>((set) => ({
  settings: readStoredSettings(),
  updateSetting: (key, value) =>
    set((state) => ({
      settings: normalizeSettings({ ...state.settings, [key]: value }),
    })),
}))

export function useSettings() {
  const settings = useSettingsStore((state) => state.settings)
  const updateSetting = useSettingsStore((state) => state.updateSetting)
  const customBackgroundUrl = useCustomBackgroundUrl()
  const wantsCustomBackground = settings.backgroundImage === customBackgroundValue

  // Sync settings to localStorage whenever they change
  useEffect(() => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  }, [settings])

  // A session that opens with a custom background selected has to read the
  // blob before the settings dialog (which owns the hook) is ever opened.
  useEffect(() => {
    if (wantsCustomBackground) {
      void loadCustomBackground()
    }
  }, [wantsCustomBackground])

  // Apply settings to CSS variables on :root
  useEffect(() => {
    const root = document.documentElement
    // The uploaded image is an object URL resolved at runtime; every other
    // option is already a URL.
    const backgroundUrl = wantsCustomBackground
      ? customBackgroundUrl
      : settings.backgroundImage

    if (backgroundUrl) {
      root.style.setProperty('--sn-user-background-image', `url("${backgroundUrl}")`)
    } else {
      root.style.removeProperty('--sn-user-background-image')
    }

    const opacity = settings.backgroundOpacity / 100

    if (settings.backgroundPattern === 'scanlines') {
      root.style.setProperty(
        '--sn-background-pattern-y',
        `linear-gradient(rgba(28, 27, 24, ${0.16 * opacity}) 1px, transparent 1px)`,
      )
      root.style.setProperty('--sn-background-pattern-x', 'none')
      root.style.setProperty('--sn-background-pattern-size', '100% 3px')
    } else if (settings.backgroundPattern === 'none') {
      root.style.setProperty('--sn-background-pattern-y', 'none')
      root.style.setProperty('--sn-background-pattern-x', 'none')
      root.style.setProperty('--sn-background-pattern-size', '24px 24px')
    } else {
      root.style.setProperty(
        '--sn-background-pattern-y',
        `linear-gradient(rgba(255, 255, 255, ${0.32 * opacity}) 1px, transparent 1px)`,
      )
      root.style.setProperty(
        '--sn-background-pattern-x',
        `linear-gradient(90deg, rgba(255, 255, 255, ${0.2 * opacity}) 1px, transparent 1px)`,
      )
      root.style.removeProperty('--sn-background-pattern-size')
    }

    // background-image layers must each resolve to an <image>, so the scrim
    // color is wrapped in a flat linear-gradient rather than used bare.
    root.style.setProperty(
      '--sn-background-scrim',
      `linear-gradient(rgba(${BACKGROUND_BASE_RGB}, ${1 - opacity}), rgba(${BACKGROUND_BASE_RGB}, ${1 - opacity}))`,
    )

    root.style.setProperty('--sidebar-width', `${settings.sidebarWidth}px`)
    root.style.setProperty('--inspector-width', `${settings.inspectorWidth}px`)
  }, [customBackgroundUrl, settings, wantsCustomBackground])

  return {
    settings,
    updateSetting,
  }
}
