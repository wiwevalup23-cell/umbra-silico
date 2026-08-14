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

describe('editor module isolation', () => {
  // Production sources only: the editor's own unit tests legitimately reach
  // for `block-actions` and the extensions directly.
  const productionFiles = import.meta.glob<string>(
    ['/src/app/**/*.{ts,tsx}', '/src/ui/**/*.{ts,tsx}', '/src/viewmodel/**/*.{ts,tsx}'],
    { eager: true, import: 'default', query: '?raw' },
  )

  function importSources(source: string): string[] {
    return [...source.matchAll(/from '([^']+)'|import\('([^']+)'\)/g)].map(
      (match) => match[1] ?? match[2],
    )
  }

  it('is reachable only through its barrel', () => {
    const deepImports = Object.entries(productionFiles)
      .filter(([file]) => !file.startsWith('/src/ui/editor/'))
      .flatMap(([file, source]) =>
        importSources(source)
          .filter((specifier) => specifier.startsWith('@/ui/editor/'))
          .map((specifier) => `${file}: ${specifier}`),
      )

    expect(deepImports).toEqual([])
  })

  it('is a leaf that only the app composes', () => {
    // Chat renders the same document and used to import the editor for two
    // constants, which put TipTap in the message feed's chunk. Those constants
    // live in `@/ui/document` now, and this keeps them there.
    const importers = Object.entries(productionFiles)
      .filter(([file]) => !file.startsWith('/src/ui/editor/'))
      .filter(([, source]) =>
        importSources(source).some((specifier) => specifier.startsWith('@/ui/editor')),
      )
      .map(([file]) => file)

    expect(importers).toEqual(['/src/app/App.tsx'])
  })

  it('keeps the document kernel independent of both surfaces', () => {
    const files = import.meta.glob<string>('/src/ui/document/**/*.{ts,tsx}', {
      eager: true,
      import: 'default',
      query: '?raw',
    })

    expect(
      findImportViolations(files, ['@/ui/editor', '@/ui/components', '@/app']),
    ).toEqual([])
  })

  it('takes the elements it needs rather than hunting for them by class', () => {
    const files = import.meta.glob<string>('/src/ui/editor/**/*.{ts,tsx}', {
      eager: true,
      import: 'default',
      query: '?raw',
    })

    // The handle reached for `.sn-editor-panel` to follow the scroll — a class
    // `App.tsx` renders. Renaming that wrapper would have stopped the handle
    // following the caret, silently, with nothing to catch it: a selector is a
    // contract no type, lint or test can see. Elements now arrive as refs.
    const lookups = Object.entries(files).flatMap(([file, source]) =>
      [...source.matchAll(/(?:closest|querySelector(?:All)?)\(\s*['"`]\./g)].map(
        (match) => `${file}: ${match[0].trim()}…`,
      ),
    )

    expect(lookups).toEqual([])
  })

  it('leaves no editor machinery behind in the notes components', () => {
    const files = import.meta.glob<string>('/src/ui/components/notes/**/*.{ts,tsx}', {
      eager: true,
      import: 'default',
      query: '?raw',
    })

    // The note library is a list of rows; the block editor, its extensions and
    // its formula rendering all left this folder. (The chat composer keeps its
    // own TipTap instance, which is why the check is scoped to notes.)
    expect(findImportViolations(files, ['@tiptap', 'katex'])).toEqual([])
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

  it('keeps the appearance store self-contained', () => {
    const files = import.meta.glob<string>('/src/appearance/**/*.{ts,tsx}', {
      eager: true,
      import: 'default',
      query: '?raw',
    })

    // The appearance store is a pure browser-API service (IndexedDB) owning
    // the user's own background image: no React, no stores, no other layers.
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
  it('keeps the automation layer clear of UI, sync, Supabase and the local store', () => {
    // The whole folder, not just the gateway. Globbing one file is how
    // `event-bus.ts` came to be typed against `Pick<LocalNotesStore, …>` for
    // as long as it was: the rule everyone believed applied to the layer only
    // ever ran against its neighbour. What the bus actually needs is named in
    // `AutomationEventStore`, which the local store satisfies structurally.
    const automationFiles = import.meta.glob<string>('/src/automation/**/*.ts', {
      eager: true,
      import: 'default',
      query: '?raw',
    })

    expect(
      findImportViolations(automationFiles, [
        '@/ui',
        '@/viewmodel',
        '@/sync',
        '@/local-store',
        'supabase',
        'dexie',
        'sqlite',
        '@tauri-apps',
      ]),
    ).toEqual([])
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
