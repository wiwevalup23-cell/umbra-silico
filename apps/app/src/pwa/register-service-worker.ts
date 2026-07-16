import { registerSW } from 'virtual:pwa-register'

export const updateServiceWorker = registerSW({
  immediate: true,
  onOfflineReady() {
    document.documentElement.dataset.pwaOfflineReady = 'true'
  },
  onRegisteredSW() {
    document.documentElement.dataset.pwaRegistered = 'true'
  },
  onRegisterError() {
    document.documentElement.dataset.pwaRegistration = 'error'
  },
})

