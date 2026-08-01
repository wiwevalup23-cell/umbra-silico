/// <reference types="node" />

import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

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
    expect((tauriConfig as { identifier?: string }).identifier).toBe(
      'app.umbra-silico.notes',
    )
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

  it('locks the webview down with a CSP that still allows the app to run', () => {
    const security = readJson<{
      app: { security: { csp: string | null; devCsp: string | null } }
    }>('src-tauri/tauri.conf.json').app.security

    function directives(policy: string | null): Map<string, string[]> {
      expect(policy).toBeTruthy()
      return new Map(
        (policy as string)
          .split(';')
          .map((part) => part.trim())
          .filter(Boolean)
          .map((part) => {
            const [name, ...values] = part.split(/\s+/)
            return [name, values] as const
          }),
      )
    }

    const csp = directives(security.csp)

    // Nothing loads from a foreign origin, and no plugin/iframe surface exists.
    expect(csp.get('default-src')).toEqual(["'self'"])
    expect(csp.get('object-src')).toEqual(["'none'"])
    expect(csp.get('frame-ancestors')).toEqual(["'none'"])
    expect(csp.get('base-uri')).toEqual(["'self'"])

    // A Telegram export can only ever become inert DOM: no injected script can
    // execute, however the parser is changed later.
    expect(csp.get('script-src')).toEqual(["'self'"])

    // Image renditions reach <img> as object URLs and Tauri commands travel
    // over the ipc: protocol, so both have to stay reachable.
    expect(csp.get('img-src')).toEqual(expect.arrayContaining(['blob:']))
    expect(csp.get('connect-src')).toEqual(
      expect.arrayContaining(['ipc:', 'http://ipc.localhost']),
    )

    // Inline styles are unavoidable: the theme drives CSS custom properties
    // through style attributes. Scripts get no such exemption.
    expect(csp.get('style-src')).toEqual(
      expect.arrayContaining(["'self'", "'unsafe-inline'"]),
    )

    // The dev policy may be looser for HMR, but only towards the dev server.
    const devCsp = directives(security.devCsp)
    expect(devCsp.get('script-src')).toEqual(
      expect.arrayContaining(["'self'", 'http://localhost:1420']),
    )
    expect(devCsp.get('connect-src')).toEqual(
      expect.arrayContaining(['ws://localhost:1420']),
    )
    for (const [name, values] of devCsp) {
      expect({ name, wildcard: values.includes('*') }).toEqual({
        name,
        wildcard: false,
      })
    }
  })

  it('grants only the desktop capabilities needed by the shipped plugins', () => {
    const capability = readJson<{
      description: string
      permissions: Array<
        string | { identifier: string; allow: Array<{ path: string }> }
      >
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
      'fs:allow-mkdir',
      'fs:allow-exists',
      'fs:allow-read-file',
      'fs:allow-write-file',
      'fs:allow-remove',
      'fs:allow-rename',
      {
        identifier: 'fs:scope',
        allow: [{ path: '$APPDATA/images' }, { path: '$APPDATA/images/**' }],
      },
    ])
  })

  it('registers SQL and FS plugins in the native shell', () => {
    const cargoToml = readFileSync('src-tauri/Cargo.toml', 'utf8')
    const libRs = readFileSync('src-tauri/src/lib.rs', 'utf8')

    expect(cargoToml).toContain('tauri-plugin-sql')
    expect(cargoToml).toContain('tauri-plugin-fs')
    expect(libRs).toContain('tauri_plugin_sql::Builder::default')
    expect(libRs).toContain('tauri_plugin_fs::init()')
    expect(libRs).toContain('pool.begin()')
    expect(libRs).toContain('execute_sqlite_transaction')
  })

  it('ships no secret-vault plugin, since nothing ever used one', () => {
    // Stronghold was wired end to end — Rust plugin, capabilities, a TypeScript
    // wrapper and a bundled npm package — but no app code ever called it. It
    // was pure attack surface, and its key derivation used a salt hardcoded in
    // the binary. Keep it gone rather than half-present.
    const sources = {
      'src-tauri/Cargo.toml': readFileSync('src-tauri/Cargo.toml', 'utf8'),
      'src-tauri/src/lib.rs': readFileSync('src-tauri/src/lib.rs', 'utf8'),
      'src-tauri/capabilities/default.json': readFileSync(
        'src-tauri/capabilities/default.json',
        'utf8',
      ),
      'package.json': readFileSync('package.json', 'utf8'),
    }

    for (const [name, contents] of Object.entries(sources)) {
      expect({ name, mentionsStronghold: /stronghold/i.test(contents) }).toEqual({
        name,
        mentionsStronghold: false,
      })
    }

    // The salt that went with it must not survive either.
    expect(sources['src-tauri/src/lib.rs']).not.toContain('argon2')
    expect(existsSync('src/platform/secure-secret-store.ts')).toBe(false)
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

})
