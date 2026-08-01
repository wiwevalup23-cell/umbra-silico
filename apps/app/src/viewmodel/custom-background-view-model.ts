import { useEffect } from 'react'
import { create } from 'zustand'
import {
  BackgroundTooLargeError,
  clearCustomBackground,
  readCustomBackground,
  UnsupportedBackgroundError,
  writeCustomBackground,
} from '@/appearance'
import type { CustomBackgroundErrorCode } from '@/shared/backgrounds'

export type CustomBackgroundError = CustomBackgroundErrorCode

export type CustomBackgroundState = {
  /** Object URL for the stored image, or `null` when the user has none. */
  url: string | null
  name: string
  /** False until the first read finishes, so the UI can hold off on "none". */
  isLoaded: boolean
  isBusy: boolean
  error: CustomBackgroundError | null
}

type CustomBackgroundActions = {
  dismissError(): void
  load(): Promise<void>
  remove(): Promise<void>
  /** Resolves to true when the file was stored and is ready to apply. */
  upload(file: File): Promise<boolean>
}

/**
 * The object URL is deliberately module-scoped rather than per-component.
 *
 * It is written onto `:root` as a CSS variable, so revoking it when a
 * particular component unmounts would blank the workspace background of every
 * other one. It is revoked only when it is replaced.
 */
function replaceUrl(previous: string | null, blob: Blob | null): string | null {
  if (previous) {
    URL.revokeObjectURL(previous)
  }

  return blob ? URL.createObjectURL(blob) : null
}

function toErrorCode(error: unknown): CustomBackgroundError {
  if (error instanceof UnsupportedBackgroundError) return 'unsupported'
  if (error instanceof BackgroundTooLargeError) return 'tooLarge'
  return 'failed'
}

const useCustomBackgroundStore = create<CustomBackgroundState & CustomBackgroundActions>(
  (set, get) => ({
    dismissError: () => set({ error: null }),
    error: null,
    isBusy: false,
    isLoaded: false,
    load: async () => {
      if (get().isLoaded) return

      const stored = await readCustomBackground()

      set((state) => ({
        isLoaded: true,
        name: stored?.name ?? '',
        url: replaceUrl(state.url, stored?.blob ?? null),
      }))
    },
    name: '',
    remove: async () => {
      await clearCustomBackground()
      set((state) => ({ name: '', url: replaceUrl(state.url, null) }))
    },
    upload: async (file) => {
      set({ error: null, isBusy: true })

      try {
        const stored = await writeCustomBackground(file, file.name)

        set((state) => ({
          isLoaded: true,
          name: stored.name,
          url: replaceUrl(state.url, stored.blob),
        }))

        return true
      } catch (error) {
        set({ error: toErrorCode(error) })
        return false
      } finally {
        set({ isBusy: false })
      }
    },
    url: null,
  }),
)

/**
 * Reads the stored background once per session and keeps every caller on the
 * same object URL.
 */
export function useCustomBackground() {
  const state = useCustomBackgroundStore()
  // Selected on its own so the effect depends on the action rather than on
  // every field of the store, which would re-run it on each upload.
  const load = useCustomBackgroundStore((store) => store.load)

  useEffect(() => {
    void load()
  }, [load])

  return state
}

/** The URL only, for callers that just need to paint it. */
export function useCustomBackgroundUrl(): string | null {
  return useCustomBackgroundStore((state) => state.url)
}

/**
 * Hydrates the stored background outside React.
 *
 * A session that starts with a custom background selected has to read it
 * before anything opens the settings dialog, which is where the hook lives.
 */
export function loadCustomBackground(): Promise<void> {
  return useCustomBackgroundStore.getState().load()
}
