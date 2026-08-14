import js from '@eslint/js'
import boundaries from 'eslint-plugin-boundaries'
import tseslint from 'typescript-eslint'

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'src-tauri/target/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Build tooling, loaded by ESLint itself through `require`.
    files: ['**/*.cjs'],
    languageOptions: {
      globals: {
        __dirname: 'readonly',
        exports: 'writable',
        module: 'writable',
        require: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      boundaries,
    },
    languageOptions: {
      globals: {
        console: 'readonly',
        document: 'readonly',
        globalThis: 'readonly',
        HTMLElement: 'readonly',
        window: 'readonly',
      },
    },
    settings: {
      // Without this the plugin cannot resolve `@/...`, calls every such
      // import external, and every rule below matches nothing.
      'import/resolver': {
        './eslint-resolver-alias.cjs': {},
      },
      'boundaries/elements': [
        { type: 'app', pattern: 'src/app/**' },
        // Listed before `ui`, because the first matching pattern wins: left
        // after it, the editor and the document kernel would dissolve back
        // into the undifferentiated UI blob they were extracted from.
        { type: 'editor', pattern: 'src/ui/editor/**' },
        { type: 'document', pattern: 'src/ui/document/**' },
        { type: 'ui', pattern: 'src/ui/**' },
        { type: 'viewmodel', pattern: 'src/viewmodel/**' },
        { type: 'repository-contracts', pattern: 'src/repository/contracts/**' },
        { type: 'repository', pattern: 'src/repository/**' },
        { type: 'local-store-contracts', pattern: 'src/local-store/contracts/**' },
        { type: 'local-store', pattern: 'src/local-store/**' },
        { type: 'sync', pattern: 'src/sync/**' },
        { type: 'automation', pattern: 'src/automation/**' },
        { type: 'backup', pattern: 'src/backup/**' },
        { type: 'chat-import', pattern: 'src/chat-import/**' },
        { type: 'chat', pattern: 'src/chat/**' },
        { type: 'images', pattern: 'src/images/**' },
        { type: 'appearance', pattern: 'src/appearance/**' },
        { type: 'crypto', pattern: 'src/crypto/**' },
        { type: 'platform', pattern: 'src/platform/**' },
        { type: 'shared', pattern: 'src/shared/**' },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          rules: [
            {
              from: { type: 'app' },
              allow: {
                to: {
                  type: [
                    'app',
                    'ui',
                    'viewmodel',
                    'repository-contracts',
                    'repository',
                    'sync',
                    'automation',
                    'appearance',
                    'backup',
                    'chat-import',
                    'chat',
                    'platform',
                    'shared',
                  ],
                },
              },
            },
            {
              // No `editor`: the editor is a leaf that only `app` composes.
              // Chat once imported it for two constants and paid for TipTap
              // in its own chunk; that vocabulary now lives in `document`.
              from: { type: 'ui' },
              allow: {
                to: { type: ['ui', 'shared'] },
              },
            },
            {
              from: { type: 'editor' },
              allow: {
                to: { type: ['editor', 'ui', 'shared'] },
              },
            },
            {
              // The document kernel describes what a note is. It must not
              // learn how either surface presents one.
              from: { type: 'document' },
              allow: {
                to: { type: ['document', 'shared'] },
              },
            },
            {
              // A module with an unguarded interior is a folder, not a module:
              // the first deep import into it re-couples whatever it touches.
              // Both are reachable only through their barrel.
              from: { type: ['app', 'ui', 'editor'] },
              allow: {
                to: { type: ['document'], internalPath: 'index.ts' },
              },
            },
            {
              from: { type: 'app' },
              allow: {
                to: { type: ['editor'], internalPath: 'index.ts' },
              },
            },
            {
              from: { type: 'viewmodel' },
              allow: {
                to: {
                  type: [
                    'viewmodel',
                    // The SyncEngine public contract, via the barrel only —
                    // `architecture.test.ts` still bans `@/sync/` internals.
                    'sync',
                    'appearance',
                    'backup',
                    'repository-contracts',
                    'chat',
                    'shared',
                  ],
                },
              },
            },
            {
              from: { type: 'appearance' },
              allow: {
                to: { type: ['appearance', 'shared'] },
              },
            },
            {
              from: { type: 'backup' },
              allow: {
                to: { type: ['backup', 'repository-contracts', 'shared'] },
              },
            },
            {
              from: { type: 'chat-import' },
              allow: {
                to: {
                  type: ['chat-import', 'chat', 'repository-contracts', 'shared'],
                },
              },
            },
            {
              from: { type: 'chat' },
              allow: {
                to: { type: ['chat', 'shared'] },
              },
            },
            {
              from: { type: 'repository' },
              allow: {
                to: {
                  type: [
                    'repository',
                    // note-repository-factory composes the event bus.
                    'automation',
                    'repository-contracts',
                    'local-store-contracts',
                    'local-store',
                    'crypto',
                    'images',
                    'shared',
                  ],
                },
              },
            },
            {
              from: { type: 'repository-contracts' },
              allow: {
                to: { type: ['repository-contracts', 'shared'] },
              },
            },
            {
              from: { type: 'local-store' },
              allow: {
                to: { type: ['local-store', 'local-store-contracts', 'shared'] },
              },
            },
            {
              from: { type: 'local-store-contracts' },
              allow: {
                to: { type: ['local-store-contracts', 'shared'] },
              },
            },
            {
              from: { type: 'sync' },
              allow: {
                to: { type: ['sync', 'repository-contracts', 'shared'] },
              },
            },
            {
              from: { type: 'automation' },
              allow: {
                // KNOWN DEVIATION: event-bus.ts types itself against
                // `@/local-store/contracts`, which the automation layer is not
                // supposed to know at all — automation-gateway.ts is held to
                // that rule by `architecture.test.ts`, event-bus.ts escapes it
                // only because the test globs a single file.
                to: {
                  type: [
                    'automation',
                    'local-store-contracts',
                    'repository-contracts',
                    'shared',
                  ],
                },
              },
            },
            {
              from: { type: 'images' },
              allow: {
                to: { type: ['images', 'shared'] },
              },
            },
            {
              from: { type: 'crypto' },
              allow: {
                to: { type: ['crypto', 'shared'] },
              },
            },
            {
              from: { type: 'platform' },
              allow: {
                to: { type: ['platform', 'shared'] },
              },
            },
            {
              from: { type: 'shared' },
              allow: {
                to: { type: 'shared' },
              },
            },
          ],
        },
      ],
    },
  },
]
