import { useAppUiStore } from '@/viewmodel/app-ui-store'

export type WindowViewModelState = {
  activeWindowId: string | null
  openWindows: string[]
}

export function useWindowViewModel(): WindowViewModelState {
  const openWindows = useAppUiStore((state) => state.openWindows)

  return {
    activeWindowId: openWindows[0] ?? null,
    openWindows,
  }
}
