import { describe, expect, it } from 'vitest'
import { architectureRoutes } from '@/app/routes'
import { emptyDocumentV1 } from '@/shared/contracts'

describe('phase 0 architecture scaffold', () => {
  it('declares the five architectural layers', () => {
    expect(architectureRoutes.map((route) => route.id)).toEqual([
      'ui',
      'viewmodel',
      'repository',
      'sync',
      'automation',
    ])
  })

  it('keeps the initial note document format serializable', () => {
    expect(JSON.parse(JSON.stringify(emptyDocumentV1))).toEqual(emptyDocumentV1)
  })
})

describe('phase 5 UI shell boundaries', () => {
  it('keeps UI components presentational', () => {
    const uiFiles = import.meta.glob<string>('/src/ui/**/*.tsx', {
      eager: true,
      import: 'default',
      query: '?raw',
    })
    const forbiddenImports = [
      '@/viewmodel',
      '@/repository',
      '@/sync',
      '@/crypto',
      '@/local-store',
      '@/platform',
      '@tauri-apps',
      'supabase',
    ]

    const violations = Object.entries(uiFiles).flatMap(([file, source]) =>
      forbiddenImports
        .filter((forbiddenImport) => source.includes(forbiddenImport))
        .map((forbiddenImport) => `${file}: ${forbiddenImport}`),
    )

    expect(violations).toEqual([])
  })
})

describe('phase 10 Automation Gateway boundaries', () => {
  it('keeps Automation Gateway isolated from UI, sync, Supabase and direct local DB adapters', () => {
    const gatewayFiles = import.meta.glob<string>('/src/automation/automation-gateway.ts', {
      eager: true,
      import: 'default',
      query: '?raw',
    })
    const forbiddenImports = [
      '@/ui',
      '@/viewmodel',
      '@/sync',
      '@/local-store',
      'supabase',
      'dexie',
      'sqlite',
      '@tauri-apps',
    ]

    const violations = Object.entries(gatewayFiles).flatMap(([file, source]) =>
      forbiddenImports
        .filter((forbiddenImport) => source.includes(forbiddenImport))
        .map((forbiddenImport) => `${file}: ${forbiddenImport}`),
    )

    expect(violations).toEqual([])
  })

  it('does not implement a local HTTP server in the MVP automation layer', () => {
    const automationFiles = import.meta.glob<string>('/src/automation/**/*.ts', {
      eager: true,
      import: 'default',
      query: '?raw',
    })
    const forbiddenRuntimeMarkers = [
      'createServer',
      'Deno.serve',
      'Bun.serve',
      '.listen(',
      'WebSocketServer',
    ]

    const violations = Object.entries(automationFiles).flatMap(([file, source]) =>
      forbiddenRuntimeMarkers
        .filter((marker) => source.includes(marker))
        .map((marker) => `${file}: ${marker}`),
    )

    expect(violations).toEqual([])
  })
})
