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

function findImportViolations(
  files: Record<string, string>,
  forbiddenImports: string[],
): string[] {
  return Object.entries(files).flatMap(([file, source]) =>
    forbiddenImports
      .filter((forbiddenImport) => source.includes(forbiddenImport))
      .map((forbiddenImport) => `${file}: ${forbiddenImport}`),
  )
}

describe('phase 5 UI shell boundaries', () => {
  it('keeps UI components and editor helpers presentational', () => {
    const uiFiles = import.meta.glob<string>('/src/ui/**/*.{ts,tsx}', {
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
      '@/images',
      '@/chat',
      '@tauri-apps',
      'supabase',
    ]

    expect(findImportViolations(uiFiles, forbiddenImports)).toEqual([])
  })
})

describe('cross-layer boundary discipline', () => {
  it('keeps ViewModel free of data, crypto, platform and infra internals', () => {
    const files = import.meta.glob<string>('/src/viewmodel/**/*.{ts,tsx}', {
      eager: true,
      import: 'default',
      query: '?raw',
    })

    // ViewModel may reference only the Repository/SyncEngine public contracts
    // (`@/repository/contracts`, `@/sync` barrel), never the implementations,
    // adapters or remote/runtime dependencies.
    expect(
      findImportViolations(files, [
        '@/local-store',
        '@/crypto',
        '@/platform',
        '@/images',
        '@/sync/',
        '@/repository/note-repository',
        '@/repository/image-repository',
        '@supabase',
        'dexie',
        '@tauri-apps',
      ]),
    ).toEqual([])
  })

  it('keeps Repository free of UI, ViewModel, sync and remote/runtime deps', () => {
    const files = import.meta.glob<string>('/src/repository/**/*.{ts,tsx}', {
      eager: true,
      import: 'default',
      query: '?raw',
    })

    expect(
      findImportViolations(files, [
        '@/ui',
        '@/viewmodel',
        '@/sync',
        "from 'react'",
        'zustand',
        '@supabase',
        'dexie',
        '@tauri-apps',
      ]),
    ).toEqual([])
  })

  it('keeps Sync Engine free of UI, ViewModel and React runtime', () => {
    const files = import.meta.glob<string>('/src/sync/**/*.{ts,tsx}', {
      eager: true,
      import: 'default',
      query: '?raw',
    })

    // Sync legitimately owns the Supabase remote gateway, so `@supabase` is allowed
    // here, but it must reach note data only through the Repository contract.
    expect(
      findImportViolations(files, [
        '@/ui',
        '@/viewmodel',
        '@/crypto',
        '@/local-store',
        '@/platform',
        "from 'react'",
        'zustand',
        '@tauri-apps',
      ]),
    ).toEqual([])
  })

  it('keeps the image processing service self-contained', () => {
    const files = import.meta.glob<string>('/src/images/**/*.{ts,tsx}', {
      eager: true,
      import: 'default',
      query: '?raw',
    })

    // The image processor is a pure browser-API service (canvas,
    // createImageBitmap): no React, no stores, no other layers.
    expect(
      findImportViolations(files, [
        '@/ui',
        '@/viewmodel',
        '@/repository',
        '@/local-store',
        '@/sync',
        '@/crypto',
        '@/platform',
        "from 'react'",
        'zustand',
        'dexie',
        '@tauri-apps',
        'supabase',
      ]),
    ).toEqual([])
  })

  it('keeps the chat log service self-contained', () => {
    const files = import.meta.glob<string>('/src/chat/**/*.{ts,tsx}', {
      eager: true,
      import: 'default',
      query: '?raw',
    })

    // The chat module is a pure message algebra over the shared note
    // document: no React, no stores, no other layers.
    expect(
      findImportViolations(files, [
        '@/ui',
        '@/viewmodel',
        '@/repository',
        '@/local-store',
        '@/sync',
        '@/crypto',
        '@/platform',
        '@/images',
        "from 'react'",
        'zustand',
        'dexie',
        '@tauri-apps',
        'supabase',
      ]),
    ).toEqual([])
  })

  it('keeps Crypto Service self-contained', () => {
    const files = import.meta.glob<string>('/src/crypto/**/*.{ts,tsx}', {
      eager: true,
      import: 'default',
      query: '?raw',
    })

    expect(
      findImportViolations(files, [
        '@/ui',
        '@/viewmodel',
        '@/sync',
        '@/repository',
        '@/local-store',
        "from 'react'",
        '@supabase',
        'dexie',
        '@tauri-apps',
      ]),
    ).toEqual([])
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
