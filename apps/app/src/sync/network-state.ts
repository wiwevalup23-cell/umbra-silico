export type NetworkState = 'offline' | 'online' | 'unknown'

export type NetworkStateUnsubscribe = () => void

export interface NetworkStateMonitor {
  getState(): NetworkState
  subscribe(listener: (state: NetworkState) => void): NetworkStateUnsubscribe
}

export class BrowserNetworkStateMonitor implements NetworkStateMonitor {
  getState(): NetworkState {
    if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') {
      return 'unknown'
    }

    return navigator.onLine ? 'online' : 'offline'
  }

  subscribe(listener: (state: NetworkState) => void): NetworkStateUnsubscribe {
    if (typeof window === 'undefined') {
      return () => undefined
    }

    const handleOnline = () => {
      listener('online')
    }
    const handleOffline = () => {
      listener('offline')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }
}

export function createBrowserNetworkStateMonitor(): NetworkStateMonitor {
  return new BrowserNetworkStateMonitor()
}
