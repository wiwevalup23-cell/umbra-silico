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
      'boundaries/elements': [
        { type: 'app', pattern: 'src/app/**' },
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
              from: { type: 'ui' },
              allow: {
                to: { type: ['ui', 'shared'] },
              },
            },
            {
              from: { type: 'viewmodel' },
              allow: {
                to: {
                  type: [
                    'viewmodel',
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
                to: { type: ['automation', 'repository-contracts', 'shared'] },
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
