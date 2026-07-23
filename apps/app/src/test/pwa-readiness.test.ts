/// <reference types="node" />

import 'fake-indexeddb/auto'

import Dexie from 'dexie'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createDexieDatabase } from '@/local-store/dexie/dexie-db'
import { DexieNotesStore } from '@/local-store/dexie/dexie-notes-store'
import { DefaultNoteRepository } from '@/repository'
import {
  deviceIdSchema,
  documentV1Contract,
  noteIdSchema,
  userIdSchema,
  type SyncOperation,
} from '@/shared/contracts'
import { DefaultSyncEngine } from '@/sync'
import type {
  NetworkState,
  NetworkStateMonitor,
  NetworkStateUnsubscribe,
} from '@/sync/network-state'
import type {
  SupabaseRemoteGateway,
  SupabaseRemoteGatewayUnsubscribe,
} from '@/sync/supabase'
import manifestRaw from '../../public/manifest.webmanifest?raw'
import viteConfigSource from '../../vite.config.ts?raw'
import mainSource from '../main.tsx?raw'
import serviceWorkerRegistrationSource from '../pwa/register-service-worker.ts?raw'
const responsiveCssSource = readFileSync(
  `${process.cwd()}/src/ui/styles/mobile-ui.css`,
  'utf8',
)
const indexHtmlSource = readFileSync(`${process.cwd()}/index.html`, 'utf8')
const androidActivitySource = readFileSync(
  `${process.cwd()}/src-tauri/gen/android/app/src/main/java/app/umbra_silico/notes/MainActivity.kt`,
  'utf8',
)

const userId = userIdSchema.parse('pwa_user')
const deviceId = deviceIdSchema.parse('pwa_device')
const noteId = noteIdSchema.parse('note_pwa_1')
const now = '2026-07-05T16:00:00.000Z'

function createDocument(text: string) {
  return {
    ...documentV1Contract.createEmpty(),
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text }],
        },
      ],
    },
  }
}

function createRepository(databaseName: string) {
  const database = createDexieDatabase(databaseName)
  const store = new DexieNotesStore({ database })
  const repository = new DefaultNoteRepository({
    localStore: store,
    userId,
    deviceId,
    idFactory: (prefix) => {
      if (prefix === 'note') return noteId
      if (prefix === 'folder') return `folder_${crypto.randomUUID()}`
      return `op_${crypto.randomUUID()}`
    },
    clock: () => now,
  })

  return { database, repository }
}

function readPngSize(path: string) {
  const buffer = readFileSync(path)

  return {
    height: buffer.readUInt32BE(20),
    width: buffer.readUInt32BE(16),
  }
}

async function waitFor(assertion: () => void): Promise<void> {
  let lastError: unknown = null

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
    }
  }

  throw lastError
}

class ManualNetworkStateMonitor implements NetworkStateMonitor {
  private readonly listeners = new Set<(state: NetworkState) => void>()
  private state: NetworkState

  constructor(state: NetworkState) {
    this.state = state
  }

  getState(): NetworkState {
    return this.state
  }

  setState(state: NetworkState): void {
    this.state = state

    for (const listener of this.listeners) {
      listener(state)
    }
  }

  subscribe(listener: (state: NetworkState) => void): NetworkStateUnsubscribe {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }
}

class FakeRemoteGateway implements SupabaseRemoteGateway {
  readonly pushedOperations: SyncOperation[] = []

  async pushOperation(operation: SyncOperation): Promise<number> {
    this.pushedOperations.push(operation)
    return 100 + this.pushedOperations.length
  }

  async pullSince(): Promise<[]> {
    return []
  }

  subscribeToChanges(): SupabaseRemoteGatewayUnsubscribe {
    return () => undefined
  }
}

describe('PWA readiness', () => {
  it('declares an installable manifest with required icons and mobile display mode', () => {
    const manifest = JSON.parse(manifestRaw) as {
      display: string
      icons: Array<{ purpose?: string; sizes: string; src: string; type: string }>
      name: string
      start_url: string
      theme_color: string
    }

    expect(manifest).toMatchObject({
      name: 'Umbra Silico',
      start_url: './',
      display: 'standalone',
      theme_color: '#f8f5ed',
    })
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: 'icons/pwa-icon-192.png',
          sizes: '192x192',
          type: 'image/png',
        }),
        expect.objectContaining({
          src: 'icons/pwa-icon-512.png',
          sizes: '512x512',
          type: 'image/png',
        }),
        expect.objectContaining({
          src: 'icons/pwa-maskable-512.png',
          purpose: 'maskable',
        }),
      ]),
    )
    expect(readPngSize('public/icons/pwa-icon-192.png')).toEqual({
      height: 192,
      width: 192,
    })
    expect(readPngSize('public/icons/pwa-icon-512.png')).toEqual({
      height: 512,
      width: 512,
    })
    expect(readPngSize('public/icons/pwa-maskable-512.png')).toEqual({
      height: 512,
      width: 512,
    })
  })

  it('registers the service worker and configures app-shell caching', () => {
    expect(mainSource).toContain("@/pwa/register-service-worker")
    expect(serviceWorkerRegistrationSource).toContain("virtual:pwa-register")
    expect(serviceWorkerRegistrationSource).toContain("immediate: true")
    expect(viteConfigSource).toContain("VitePWA")
    expect(viteConfigSource).toContain("const base = process.env.VITE_BASE_PATH ?? '/'")
    expect(viteConfigSource).toContain('navigateFallback: `${base}index.html`')
    expect(viteConfigSource).toContain("CacheFirst")
    expect(viteConfigSource).toContain("manifest: false")
  })

  it('uses a dedicated, touch-safe mobile layout instead of scaling the desktop canvas', () => {
    expect(responsiveCssSource).toContain('--sn-mobile-safe-top: env(safe-area-inset-top, 0px)')
    expect(responsiveCssSource).toContain('--sn-mobile-safe-bottom: env(safe-area-inset-bottom, 0px)')
    expect(responsiveCssSource).toContain('@media (max-width: 959px)')
    expect(responsiveCssSource).toContain('@media (max-width: 600px)')
    expect(responsiveCssSource).toContain('@media (max-width: 479px)')
    expect(responsiveCssSource).toContain('@media (max-width: 359px)')
    expect(responsiveCssSource).toContain('(orientation: landscape)')
    expect(responsiveCssSource).toContain('.sn-workspace[data-mobile-tab="notes"]')
    expect(responsiveCssSource).toContain('.sn-workspace[data-mobile-tab="editor"]')
    expect(responsiveCssSource).toContain('.sn-workspace[data-mobile-tab="details"]')
    expect(responsiveCssSource).toContain('display: none !important')
    expect(responsiveCssSource).toContain('display: flex !important')
    expect(responsiveCssSource).toContain('overscroll-behavior-x: contain')
    expect(responsiveCssSource).toContain('min-width: 44px')
    expect(responsiveCssSource).toContain('min-height: 44px')
    expect(responsiveCssSource).toContain('100dvh')
    expect(responsiveCssSource).toContain('overflow-wrap: anywhere')
    expect(responsiveCssSource).toContain('grid-auto-rows: max-content')
    expect(responsiveCssSource).toContain('align-content: start')
    expect(responsiveCssSource).not.toMatch(/\bzoom\s*:/)
    expect(responsiveCssSource).not.toContain('scale(')
  })

  it('keeps editor popovers inside the usable mobile viewport', () => {
    expect(responsiveCssSource).toMatch(
      /\.sn-editor-tools-menu,[\s\S]*?\.sn-block-handle-menu--wide\s*\{[\s\S]*?position: fixed !important/,
    )
    expect(responsiveCssSource).toContain(
      'bottom: calc(var(--sn-tabbar-height) + 8px) !important',
    )
    expect(responsiveCssSource).toContain('max-height: min(60dvh, 520px)')
    expect(responsiveCssSource).toContain('.sn-editor-shell--empty .sn-empty-player')
    expect(responsiveCssSource).toContain('.sn-mobile-empty-state')
  })

  it('declares cutout-aware viewport behavior and consumes Android system-bar insets once', () => {
    expect(indexHtmlSource).toContain('viewport-fit=cover')
    expect(indexHtmlSource).toContain('interactive-widget=resizes-content')
    expect(androidActivitySource).toContain('enableEdgeToEdge(')
    expect(androidActivitySource).toContain('WindowInsetsCompat.Type.systemBars()')
    expect(androidActivitySource).toContain('WindowInsetsCompat.Type.displayCutout()')
    expect(androidActivitySource).toContain('WindowInsetsCompat.CONSUMED')
    expect(androidActivitySource).toContain('isAppearanceLightStatusBars = true')
    expect(androidActivitySource).toContain('isAppearanceLightNavigationBars = true')
  })


  it('reopens notes from IndexedDB after the app shell reloads offline', async () => {
    const databaseName = `pwa_persistence_${crypto.randomUUID()}`
    const first = createRepository(databaseName)

    try {
      const createdNoteId = await first.repository.createNote({
        title: 'Offline persisted',
        document: createDocument('Saved before reload'),
      })
      first.database.close()

      const second = createRepository(databaseName)

      try {
        await expect(second.repository.getNote(createdNoteId)).resolves.toMatchObject({
          title: 'Offline persisted',
          preview: 'Saved before reload',
        })
      } finally {
        second.database.close()
      }
    } finally {
      await Dexie.delete(databaseName)
    }
  })

  it('saves editor-style writes offline and flushes the outbox after reconnect', async () => {
    const databaseName = `pwa_offline_sync_${crypto.randomUUID()}`
    const { database, repository } = createRepository(databaseName)
    const networkState = new ManualNetworkStateMonitor('offline')
    const remoteGateway = new FakeRemoteGateway()
    const engine = new DefaultSyncEngine({
      networkState,
      noteRepository: repository,
      remoteGateway,
      sleep: async () => undefined,
    })

    try {
      await engine.start()
      const createdNoteId = await repository.createNote({
        title: 'Offline draft',
        document: createDocument('Initial offline body'),
      })
      await repository.updateNote(createdNoteId, {
        document: createDocument('Edited while offline'),
      })

      await expect(repository.getNote(createdNoteId)).resolves.toMatchObject({
        preview: 'Edited while offline',
        syncStatus: 'dirty',
      })
      expect(remoteGateway.pushedOperations).toEqual([])

      networkState.setState('online')

      await waitFor(() => {
        expect(remoteGateway.pushedOperations.length).toBeGreaterThan(0)
        expect(engine.getStatus().pendingOperations).toBe(0)
        expect(engine.getStatus().status).toBe('idle')
      })
    } finally {
      await engine.stop()
      database.close()
      await Dexie.delete(databaseName)
    }
  })
})
