/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  createTauriStrongholdSecretStore,
  createUnavailableSecureSecretStore,
} from '@/platform'

const textDecoder = new TextDecoder()

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

describe('phase 12 Tauri desktop packaging readiness', () => {
  it('configures the Ubuntu desktop shell, SQL preload and bundle icons', () => {
    const tauriConfig = readJson<{
      app: {
        windows: Array<Record<string, unknown>>
      }
      bundle: {
        active: boolean
        icon: string[]
        targets: string[]
      }
      plugins: Record<string, unknown>
    }>('src-tauri/tauri.conf.json')

    expect(tauriConfig.app.windows[0]).toMatchObject({
      center: true,
      decorations: true,
      fullscreen: false,
      height: 820,
      label: 'main',
      minHeight: 640,
      minWidth: 920,
      resizable: true,
      theme: 'Light',
      title: 'Umbra Silico',
      width: 1200,
    })
    expect(tauriConfig.bundle).toMatchObject({
      active: true,
      targets: ['deb', 'appimage'],
    })
    expect(tauriConfig.bundle.icon).toEqual(
      expect.arrayContaining([
        'icons/32x32.png',
        'icons/128x128.png',
        'icons/128x128@2x.png',
        'icons/icon.icns',
        'icons/icon.ico',
      ]),
    )
    expect(tauriConfig.plugins.sql).toEqual({
      preload: ['sqlite:silicon-nostalgia.db'],
    })
    expect(tauriConfig.plugins).not.toHaveProperty('stronghold')
  })

  it('grants only the desktop capabilities needed by phase 12 plugins', () => {
    const capability = readJson<{
      description: string
      permissions: string[]
      windows: string[]
    }>('src-tauri/capabilities/default.json')

    expect(capability.windows).toEqual(['main'])
    expect(capability.description).toContain('Ubuntu shell')
    expect(capability.permissions).toEqual([
      'core:default',
      'sql:default',
      'sql:allow-load',
      'sql:allow-execute',
      'sql:allow-select',
      'sql:allow-close',
      'stronghold:default',
      'stronghold:allow-remove-store-record',
    ])
  })

  it('registers SQL and Stronghold plugins in the native shell', () => {
    const cargoToml = readFileSync('src-tauri/Cargo.toml', 'utf8')
    const libRs = readFileSync('src-tauri/src/lib.rs', 'utf8')

    expect(cargoToml).toContain('tauri-plugin-sql')
    expect(cargoToml).toContain('tauri-plugin-stronghold')
    expect(cargoToml).toContain('argon2')
    expect(libRs).toContain('tauri_plugin_stronghold::Builder::new')
    expect(libRs).toContain('silicon-nostalgia-stronghold-v1')
    expect(libRs).toContain('tauri_plugin_sql::Builder::default')
  })

  it('uses the same SQLite database name in Tauri runtime and SQL preload', () => {
    const providersSource = readFileSync('src/app/providers.tsx', 'utf8')
    const sqliteDriverSource = readFileSync(
      'src/local-store/sqlite/tauri-sqlite-driver.ts',
      'utf8',
    )

    expect(providersSource).toContain("runtime === 'tauri' ? 'silicon-nostalgia.db'")
    expect(sqliteDriverSource).toContain('sqlite:silicon-nostalgia.db')
  })

  it('keeps the future local HTTP API disabled in desktop packaging', () => {
    const automationSource = readFileSync('src/automation/automation-gateway.ts', 'utf8')
    const automationReadme = readFileSync('src/automation/local-api/README.md', 'utf8')

    expect(automationSource).toContain('enabledByDefault: false')
    expect(automationSource).toContain("transport: 'post-mvp-local-http'")
    expect(automationReadme).toContain('no HTTP server')
  })

  it('keeps sync wired as a background provider process when remote config exists', () => {
    const providersSource = readFileSync('src/app/providers.tsx', 'utf8')
    const syncProviderSource = readFileSync(
      'src/viewmodel/sync-engine-provider.tsx',
      'utf8',
    )

    expect(providersSource).toContain('readSiliconSupabaseConfig')
    expect(providersSource).toContain('createSyncEngine')
    expect(providersSource).toContain('setSyncEngine(nextSyncEngine)')
    expect(syncProviderSource).toContain('void syncEngine.start()')
    expect(syncProviderSource).toContain('void syncEngine.stop()')
  })

  it('wraps Tauri Stronghold as a save-on-write secure secret store', async () => {
    const saved = vi.fn(async () => undefined)
    const values = new Map<string, Uint8Array>()
    const store = {
      async get(key: string) {
        return values.get(key) ?? null
      },
      async insert(key: string, value: number[]) {
        values.set(key, new Uint8Array(value))
      },
      async remove(key: string) {
        const previous = values.get(key) ?? null
        values.delete(key)
        return previous
      },
    }
    const client = {
      getStore: () => store,
      getVault: vi.fn(),
    }
    const strongholdInstance = {
      createClient: vi.fn(async () => client),
      loadClient: vi.fn(async () => {
        throw new Error('client missing')
      }),
      save: saved,
    }
    const Stronghold = {
      load: vi.fn(async () => strongholdInstance),
    }

    const secretStore = await createTauriStrongholdSecretStore('vault password', {
      path: {
        appDataDir: vi.fn(async () => '/tmp/silicon-nostalgia'),
        join: vi.fn(async (...paths: string[]) => paths.join('/')),
      },
      stronghold: {
        Stronghold,
      },
    })

    await secretStore.setSecret('supabase-refresh-token', new TextEncoder().encode('secret'))

    const secret = await secretStore.getSecret('supabase-refresh-token')

    expect(Stronghold.load).toHaveBeenCalledWith(
      '/tmp/silicon-nostalgia/silicon-nostalgia.vault.hold',
      'vault password',
    )
    expect(strongholdInstance.createClient).toHaveBeenCalledWith('silicon-nostalgia')
    expect(textDecoder.decode(secret ?? new Uint8Array())).toBe('secret')
    expect(saved).toHaveBeenCalledTimes(2)

    await secretStore.removeSecret('supabase-refresh-token')

    expect(await secretStore.getSecret('supabase-refresh-token')).toBeNull()
    expect(saved).toHaveBeenCalledTimes(3)
  })

  it('does not expose secure storage in browser runtime by accident', async () => {
    const store = createUnavailableSecureSecretStore()

    await expect(store.getSecret('anything')).rejects.toThrow(
      'Secure secret storage is available only in Tauri runtime.',
    )
  })
})
