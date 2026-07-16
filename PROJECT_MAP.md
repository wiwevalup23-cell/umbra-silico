# Umbra Silico Project Map

Дата актуализации: 2026-07-15

Этот файл описывает, где что лежит в директории `umbra silico`, какие папки являются рабочими для приложения, где лежат runtime-assets, а какие папки являются макетами, исходниками, архивами или кандидатами на чистку.

## Коротко

Рабочее приложение находится здесь:

```txt
apps/app/
```

Runtime-assets, которые реально грузит приложение, лежат здесь:

```txt
apps/app/public/
apps/app/src/ui/icons/
```

Документы и аудиты лежат здесь:

```txt
papers/
PROJECT_MAP.md
UX_review.md
```

Все остальные корневые папки в основном являются дизайн-исходниками, макетами, референсами, архивами или бэкапами.

## Корень Проекта

```txt
.
├── apps/                                  # Рабочее приложение
├── supabase/                              # SQL migrations для remote sync
├── papers/                                # Документация, аудиты, планы
├── backups/                               # Файловые бэкапы перед UI-правками
├── PROJECT_MAP.md                         # Эта карта проекта
├── UX_review.md                           # UX-аудит в корне
├── actual/                                # Исходный набор SVG-иконок, не runtime
├── based_ui/                              # Старый прототип/scaffold
├── design-taste/                          # Локальные дизайн-инструкции/skill docs
├── elements/                              # Старый одиночный design asset
├── fons/                                  # Исходные фоны, уже скопированы в app/public
├── hello/                                 # Старый макет empty player / UI
├── imagegen/                              # Локальные imagegen skill/scripts
├── refrenses/                             # Референсы и исходники
├── troubles/                              # Временные problem screenshots
├── variants/                              # Большие библиотеки иконок/вариантов
├── Анализ дизайна записной книжки/        # Старый аудит/макет
├── Анализ дизайна записной книжки_элементы/ # Старые UI element макеты
├── Иконка затмения с циркулем и буквой U_final/ # Исходный макет логотипа
├── архивы/                                # Zip-архивы макетов/исходников
└── проверить/                             # Старый макет/проверочный экспорт
```

## Рабочее Приложение

```txt
apps/app/
├── package.json                 # npm scripts и зависимости
├── package-lock.json            # lockfile
├── vite.config.ts               # Vite/PWA config
├── index.html                   # HTML entry
├── README.md                    # Технический README приложения
├── PHASE_13_VERIFICATION_REPORT.md
├── src/                         # Основной исходный код React/TS
├── public/                      # Public runtime-assets
├── src-tauri/                   # Tauri desktop shell/config
├── scripts/                     # Вспомогательные scripts
├── dist/                        # Build output, можно пересоздать
└── node_modules/                # npm dependencies, можно пересоздать через npm install
```

### Команды

Запускать из `apps/app`:

```bash
npm run dev
npm run check
npm run lint
npm run test:run
npm run build
npm run dev:tauri
npm run build:tauri
```

## `apps/app/src`

```txt
apps/app/src/
├── app/              # App composition, providers, route shell
├── automation/       # Automation Gateway, event bus, future local API contract
├── crypto/           # Crypto service, keyring, password KDF
├── local-store/      # Local storage contracts + Dexie/SQLite adapters
├── platform/         # Browser/Tauri runtime detection and platform services
├── pwa/              # Service worker registration
├── repository/       # NoteRepository facade, live queries, mappers
├── shared/           # Shared contracts, schemas, IDs, time utils
├── sync/             # Sync engine, outbox, Supabase gateway, conflict policy
├── test/             # Vitest tests
├── ui/               # Dumb UI components, editor UI, icons, styles
├── viewmodel/        # React hooks / Zustand UI state / repository bridge
├── App.tsx           # Re-export entry
├── main.tsx          # React mount
└── index.css         # CSS imports
```

### `src/app`

```txt
src/app/
├── App.tsx           # Главный workspace: topbar, Library, Editor, Details
├── providers.tsx     # Repository/SyncEngine bootstrapping
├── routes.ts         # Route constants
└── index.ts          # Barrel export
```

### `src/ui`

```txt
src/ui/
├── components/
│   ├── notes/        # NoteList, NoteCard, EditorShell, Inspector, LockModal
│   └── silicon/      # Silicon Nostalgia primitives/settings/mobile tab bar
├── editor/           # Debounced autosave helper
├── icons/
│   ├── actual/       # Selected imported SVG icon assets
│   ├── notion/       # Notion-like icon paths
│   ├── ui/           # Inline app UI icons
│   └── y2k/          # Selected Y2K icon assets
├── styles/
│   ├── globals.css
│   ├── silicon-nostalgia.css
│   ├── mobile-ui.css
│   └── y2k-accents.css
└── index.ts
```

Главные UI-файлы:

```txt
src/app/App.tsx
src/ui/components/notes/EditorShell.tsx
src/ui/components/notes/NoteList.tsx
src/ui/components/notes/WorkspaceInspector.tsx
src/ui/components/silicon/SettingsModal.tsx
src/ui/styles/silicon-nostalgia.css
```

### `src/viewmodel`

```txt
src/viewmodel/
├── app-ui-store.ts                  # Zustand UI-only state
├── notes-view-model.ts              # list/create/delete/select note VM
├── active-note-view-model.ts        # active note + title/document update
├── lock-modal-view-model.ts         # lock/unlock modal behavior
├── sync-view-model.ts               # sync badge/pending ops
├── useSettings.ts                   # UI settings persisted in localStorage
├── repository-provider.tsx          # Repository context
├── sync-engine-provider.tsx         # SyncEngine context
└── ...
```

### `src/repository`

```txt
src/repository/
├── contracts/                       # NoteRepository/LiveQuery contracts
├── mappers/                         # local/remote note mappers
├── note-repository.ts               # DefaultNoteRepository
├── note-repository-factory.ts
├── live-query.ts
└── index.ts
```

### `src/local-store`

```txt
src/local-store/
├── contracts/                       # LocalNotesStore and row contracts
├── dexie/                           # Browser IndexedDB implementation
├── sqlite/                          # Tauri SQLite implementation
├── serialization.ts
├── local-notes-store-factory.ts
└── index.ts
```

### `src/sync`

```txt
src/sync/
├── supabase/                        # Supabase client/config/gateway
├── sync-engine.ts
├── sync-runner.ts
├── outbox-processor.ts
├── remote-pull.ts
├── remote-push.ts
├── realtime-listener.ts
├── conflict-policy.ts
└── network-state.ts
```

## Runtime Assets

Все assets, нужные приложению во время работы, должны лежать внутри `apps/app/public` или `apps/app/src`.

```txt
apps/app/public/
├── assets/
│   ├── fons/                                      # Background picker images
│   ├── hello-smooth.svg                           # Empty player "hello"
│   ├── mac-hello-1984.svg                         # Legacy/available asset
│   ├── player-bg.webp                             # Available/legacy player bg
│   ├── player-warm-cut.png                        # Empty player main image
│   └── umbra-silico-eclipse-compass-u.svg         # Current brand logo
├── fonts/
│   ├── EBGaramond12-Bold.woff
│   └── EBGaramond12-Regular.woff
├── icons/
│   ├── pwa-icon-192.png
│   ├── pwa-icon-512.png
│   ├── pwa-icon.svg
│   └── pwa-maskable-512.png
├── favicon.svg
└── manifest.webmanifest
```

Selected SVG icons used by React components live in:

```txt
apps/app/src/ui/icons/
```

## Tauri Desktop

```txt
apps/app/src-tauri/
├── tauri.conf.json
├── Cargo.toml
├── Cargo.lock
├── src/
├── capabilities/
├── icons/
├── docker/
└── target/                  # Rust/Tauri build output, can be regenerated
```

`target/` is generated output. Keep it if you need local release artifacts; otherwise it can be rebuilt.

## Documentation

```txt
papers/
├── Silicon_Nostalgia_App_Spec.md
├── Silicon_Nostalgia_Phased_Implementation_Plan.md
├── UX_review.md
├── design_audit.md
├── design_audit_adaptivity.md
└── silicon_nostalgia_code_review.md
```

Root docs:

```txt
UX_review.md
PROJECT_MAP.md
```

Note: there is also `papers/UX_review.md`. If both are kept, decide which one is canonical to avoid drift.

## Backups

```txt
backups/
```

Contains timestamped copies of files before UI changes. These are not used by the app.

Current notable logo backups:

```txt
backups/logo-size-prechange-20260715-155115/
backups/logo-border-wordmark-prechange-20260715-160101/
```

Policy suggestion:

- Keep backups while actively iterating.
- After a stable checkpoint, archive or delete old backup folders.

## Design Sources And References

These folders are not imported by the current app. They are source material, old exports, references, or candidate cleanup targets.

```txt
actual/                                  # Original SVG icon source set
based_ui/                                # Old UI scaffold/prototype
elements/                                # Old design element image
fons/                                    # Source backgrounds, copied into app/public
hello/                                   # Old player/hello UI export
refrenses/                               # Visual references and icon source archives
variants/                                # Large icon/design asset libraries
Анализ дизайна записной книжки/          # Old design audit export
Анализ дизайна записной книжки_элементы/ # Old element export
Иконка затмения с циркулем и буквой U_final/ # Logo source/export
проверить/                               # Old verification/export folder
архивы/                                  # Zip archives of old source/export folders
troubles/                                # Temporary issue screenshots
```

## Tooling / Agent Support Folders

These are not application runtime folders.

```txt
.claude/          # Local Claude/settings
.skills/          # Local skill notes
design-taste/     # Design-taste skill/reference notes
imagegen/         # Imagegen skill/scripts/reference files
```

Do not delete these unless you intentionally want to remove local assistant/tooling materials from the project folder.

## Cleanup Guidance

### Safe to remove after confirming no need for source history

These folders are not referenced by `apps/app` and the needed runtime assets have already been copied into `apps/app/public` or `apps/app/src`.

```txt
fons/
hello/
проверить/
Анализ дизайна записной книжки/
Анализ дизайна записной книжки_элементы/
Иконка затмения с циркулем и буквой U_final/
архивы/
elements/
based_ui/
troubles/
```

### Safe to remove only if you no longer need design libraries

```txt
variants/
actual/
refrenses/
```

These are large/old source libraries. The current app does not import them, but they may be useful for future visual exploration.

### Generated folders inside the app

These can be regenerated:

```txt
apps/app/node_modules/
apps/app/dist/
apps/app/src-tauri/target/
```

Only remove them when you are comfortable reinstalling/rebuilding.

## Asset Placement Rules Going Forward

Use these rules to keep the project clean:

1. Runtime images, SVGs, fonts, PWA icons:

```txt
apps/app/public/
```

2. React-imported SVG icon modules:

```txt
apps/app/src/ui/icons/
```

3. UI components:

```txt
apps/app/src/ui/components/
```

4. Global/UI CSS:

```txt
apps/app/src/ui/styles/
```

5. Product docs and audits:

```txt
papers/
```

6. Temporary source/reference folders:

```txt
refrenses/
variants/
```

Move only selected final assets from source/reference folders into `apps/app/public` or `apps/app/src/ui/icons`.

## Current App Asset Dependencies

The app currently references:

```txt
/assets/umbra-silico-eclipse-compass-u.svg
/assets/player-warm-cut.png
/assets/hello-smooth.svg
/assets/fons/*
/fonts/EBGaramond12-Regular.woff
/fonts/EBGaramond12-Bold.woff
/icons/pwa-icon-192.png
/icons/pwa-icon-512.png
/icons/pwa-maskable-512.png
```

The source-of-truth copies are under `apps/app/public`.
