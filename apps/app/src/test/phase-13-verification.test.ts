/// <reference types="node" />

import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type SourceMap = Record<string, string>

const uiSources = import.meta.glob<string>('/src/ui/**/*.{ts,tsx}', {
  eager: true,
  import: 'default',
  query: '?raw',
})
const syncSources = import.meta.glob<string>('/src/sync/**/*.ts', {
  eager: true,
  import: 'default',
  query: '?raw',
})
const automationSources = import.meta.glob<string>('/src/automation/**/*.ts', {
  eager: true,
  import: 'default',
  query: '?raw',
})
const productionSources = {
  ...import.meta.glob<string>('/src/app/**/*.{ts,tsx}', {
    eager: true,
    import: 'default',
    query: '?raw',
  }),
  ...import.meta.glob<string>('/src/automation/**/*.ts', {
    eager: true,
    import: 'default',
    query: '?raw',
  }),
  ...import.meta.glob<string>('/src/crypto/**/*.ts', {
    eager: true,
    import: 'default',
    query: '?raw',
  }),
  ...import.meta.glob<string>('/src/platform/**/*.ts', {
    eager: true,
    import: 'default',
    query: '?raw',
  }),
  ...import.meta.glob<string>('/src/shared/**/*.ts', {
    eager: true,
    import: 'default',
    query: '?raw',
  }),
  ...import.meta.glob<string>('/src/sync/**/*.ts', {
    eager: true,
    import: 'default',
    query: '?raw',
  }),
  ...import.meta.glob<string>('/src/ui/**/*.{ts,tsx}', {
    eager: true,
    import: 'default',
    query: '?raw',
  }),
  ...import.meta.glob<string>('/src/viewmodel/**/*.ts?(x)', {
    eager: true,
    import: 'default',
    query: '?raw',
  }),
} satisfies SourceMap

const appUiStoreSource = readFileSync('src/viewmodel/app-ui-store.ts', 'utf8')
const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>
}
const phase12Checklist = readFileSync('src-tauri/PHASE_12_RELEASE_CHECKLIST.md', 'utf8')
const tauriConfig = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')) as {
  bundle: { targets: string[] }
  plugins?: Record<string, unknown>
}
const viteConfigSource = readFileSync('vite.config.ts', 'utf8')
const manifestSource = readFileSync('public/manifest.webmanifest', 'utf8')

function extractModuleSpecifiers(source: string): string[] {
  const specifiers = new Set<string>()
  const staticImportPattern =
    /^\s*import(?:\s+type)?(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/gm
  const sideEffectImportPattern = /^\s*import\s+['"]([^'"]+)['"]/gm
  const dynamicImportPattern = /import\(\s*['"]([^'"]+)['"]\s*\)/g

  for (const match of source.matchAll(staticImportPattern)) {
    specifiers.add(match[1])
  }

  for (const match of source.matchAll(sideEffectImportPattern)) {
    specifiers.add(match[1])
  }

  for (const match of source.matchAll(dynamicImportPattern)) {
    specifiers.add(match[1])
  }

  return [...specifiers]
}

function isModuleOrSubpath(specifier: string, moduleName: string): boolean {
  return specifier === moduleName || specifier.startsWith(`${moduleName}/`)
}

function findForbiddenImports(
  sources: SourceMap,
  isForbidden: (specifier: string) => boolean,
): string[] {
  return Object.entries(sources)
    .flatMap(([file, source]) =>
      extractModuleSpecifiers(source)
        .filter(isForbidden)
        .map((specifier) => `${file} -> ${specifier}`),
    )
    .sort()
}

describe('phase 13 verification pass', () => {
  it('keeps UI free of Supabase, local DB adapters and Crypto Service imports', () => {
    const forbidden = findForbiddenImports(
      uiSources,
      (specifier) =>
        isModuleOrSubpath(specifier, '@/repository') ||
        isModuleOrSubpath(specifier, '@/sync') ||
        isModuleOrSubpath(specifier, '@/local-store') ||
        isModuleOrSubpath(specifier, '@/crypto') ||
        isModuleOrSubpath(specifier, '@/platform') ||
        isModuleOrSubpath(specifier, '@supabase/supabase-js') ||
        isModuleOrSubpath(specifier, '@tauri-apps/plugin-sql') ||
        isModuleOrSubpath(specifier, 'dexie') ||
        specifier.toLowerCase().includes('sqlite'),
    )

    expect(forbidden).toEqual([])
  })

  it('keeps Zustand as UI-only state instead of a note source of truth', () => {
    expect(appUiStoreSource).toContain("openWindows: ['workspace']")
    expect(appUiStoreSource).toContain("syncBadge: 'idle'")
    expect(appUiStoreSource).toContain('activeNoteId')
    expect(appUiStoreSource).toContain('lockModalNoteId')
    expect(appUiStoreSource).not.toMatch(/\bnotes\s*:/)
    expect(appUiStoreSource).not.toContain('NoteListItem')
    expect(appUiStoreSource).not.toContain('NoteDetail')
    expect(appUiStoreSource).not.toContain('LocalNote')
  })

  it('keeps sync on Repository contracts instead of local DB, UI or Zustand', () => {
    const forbidden = findForbiddenImports(
      syncSources,
      (specifier) =>
        isModuleOrSubpath(specifier, '@/local-store') ||
        isModuleOrSubpath(specifier, '@/ui') ||
        isModuleOrSubpath(specifier, '@/viewmodel') ||
        isModuleOrSubpath(specifier, '@/crypto') ||
        isModuleOrSubpath(specifier, 'react') ||
        isModuleOrSubpath(specifier, 'zustand') ||
        isModuleOrSubpath(specifier, 'dexie') ||
        isModuleOrSubpath(specifier, '@tauri-apps/plugin-sql') ||
        specifier.toLowerCase().includes('sqlite'),
    )

    expect(forbidden).toEqual([])
    expect(syncSources['/src/sync/sync-engine.ts']).toContain(
      "import type { NoteRepository } from '@/repository/contracts'",
    )
    expect(syncSources['/src/sync/remote-push.ts']).toContain(
      'await noteRepository.markOpSynced',
    )
    expect(syncSources['/src/sync/remote-pull.ts']).toContain(
      'await noteRepository.markConflict',
    )
  })

  it('routes Automation Gateway writes through Repository and keeps local HTTP disabled', () => {
    const gatewaySource = automationSources['/src/automation/automation-gateway.ts']
    const forbidden = findForbiddenImports(
      {
        '/src/automation/automation-gateway.ts': gatewaySource,
      },
      (specifier) =>
        isModuleOrSubpath(specifier, '@/local-store') ||
        isModuleOrSubpath(specifier, '@/sync') ||
        isModuleOrSubpath(specifier, '@/ui') ||
        isModuleOrSubpath(specifier, '@/viewmodel') ||
        isModuleOrSubpath(specifier, '@supabase/supabase-js') ||
        isModuleOrSubpath(specifier, 'dexie') ||
        isModuleOrSubpath(specifier, '@tauri-apps/plugin-sql') ||
        specifier.toLowerCase().includes('sqlite'),
    )

    expect(forbidden).toEqual([])
    expect(gatewaySource).toContain("import type { NoteRepository } from '@/repository/contracts'")
    expect(gatewaySource).toContain('await this.noteRepository.createNote')
    expect(gatewaySource).toContain('await this.noteRepository.updateNote')
    expect(gatewaySource).toContain('await this.noteRepository.deleteNote')
    expect(gatewaySource).toContain('enabledByDefault: false')
    expect(gatewaySource).toContain("transport: 'post-mvp-local-http'")
  })

  it('limits direct local adapter imports to local-store and Repository composition code', () => {
    const forbidden = findForbiddenImports(
      Object.fromEntries(
        Object.entries(productionSources).filter(
          ([file]) =>
            !file.startsWith('/src/local-store/') &&
            file !== '/src/repository/note-repository-factory.ts',
        ),
      ),
      (specifier) =>
        isModuleOrSubpath(specifier, '@/local-store/dexie') ||
        isModuleOrSubpath(specifier, '@/local-store/sqlite') ||
        isModuleOrSubpath(specifier, 'dexie') ||
        isModuleOrSubpath(specifier, '@tauri-apps/plugin-sql'),
    )

    expect(forbidden).toEqual([])
  })

  it('keeps Phase 13 release gates represented in runnable project commands and configs', () => {
    expect(packageJson.scripts).toMatchObject({
      build: 'tsc -b && vite build',
      'build:tauri': 'tauri build',
      check: 'tsc -b',
      lint: 'oxlint && eslint .',
      'lint:architecture': 'eslint .',
      'test:run': 'vitest run',
      'verify:phase13': 'npm run check && npm run test:run && npm run lint && npm run build',
    })
    expect(viteConfigSource).toContain('VitePWA')
    expect(viteConfigSource).toContain("navigateFallback: '/index.html'")
    expect(JSON.parse(manifestSource)).toMatchObject({
      display: 'standalone',
      start_url: '/',
    })
    expect(tauriConfig.bundle.targets).toEqual(['deb', 'appimage'])
    expect(tauriConfig.plugins?.sql).toEqual({
      preload: ['sqlite:silicon-nostalgia.db'],
    })
    expect(phase12Checklist).toContain('Headless Desktop Smoke Test')
    expect(phase12Checklist).toContain('xvfb-run')
    expect(existsSync('src-tauri/docker/ubuntu-builder.Dockerfile')).toBe(true)
  })
})
