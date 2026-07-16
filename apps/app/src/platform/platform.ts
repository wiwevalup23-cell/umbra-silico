export type RuntimePlatform = 'browser' | 'tauri'

export function detectPlatform(): RuntimePlatform {
  const tauriGlobal = globalThis as { __TAURI_INTERNALS__?: unknown }
  return tauriGlobal.__TAURI_INTERNALS__ ? 'tauri' : 'browser'
}
