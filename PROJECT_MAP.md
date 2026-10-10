# Umbra Silico Project Map

Дата актуализации: 2026-10-08 (чистка устаревших аудитов и макетов)

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
```

Все остальные корневые папки в основном являются дизайн-исходниками, макетами, референсами, архивами или бэкапами.

## Корень Проекта

```txt
.
├── apps/                                  # Рабочее приложение
├── supabase/                              # SQL migrations для remote sync
├── papers/                                # Актуальные документы: мастер-промпт правок, реестр долга
├── backups/                               # Файловые бэкапы перед UI-правками (могут содержать реальную БД)
├── PROJECT_MAP.md                         # Эта карта проекта
├── actual/                                # Исходный набор SVG-иконок, не runtime
├── hello/                                 # Исходники плеера и надписи «hello» (не трогать)
├── refrenses/                             # Референсы (Mac OS X и др.) и исходники
├── variants/                              # Большие библиотеки иконок/вариантов
├── Иконка затмения с циркулем и буквой U/ # Исходный макет логотипа
├── архивы/                                # Zip-архивы макетов/исходников
└── чат экспорты/                          # Экспорты Telegram для проверки импорта
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
├── Master_Prompt_UI_Fixes_2026-10-08.md  # Текущее задание на визуальные правки
└── cross_module_debt.md                  # Живой реестр межмодульного долга
```

`cross_module_debt.md` — не аудит и не план, а рабочий список. Запись заводится,
когда работа внутри модуля упирается в чужой контракт, общий стилевой файл или
словарь, и удаляется, когда правка сделана.

Старые аудиты, планы и разборы (июль–октябрь 2026: спецификация Silicon
Nostalgia, аудиты D01–D22 и V01–V41, визуальный разбор R01–R25, брифы Claude
Design и отчёты о переносе дизайн-системы) убраны 2026-10-08 в Корзину; то, что
из них ещё открыто, перечислено в конце мастер-промпта. Отслеживаемые в git
версии остаются в истории.

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

These folders are not imported by the current app. They are source material, references, or archives.

```txt
actual/                                  # Original SVG icon source set
hello/                                   # Source of the player picture and the "hello" lettering — keep
refrenses/                               # Visual references (Mac OS X etc.) and icon source archives
variants/                                # Large icon/design asset libraries
Иконка затмения с циркулем и буквой U/   # Logo source/export
архивы/                                  # Zip archives of old source/export folders
чат экспорты/                            # Telegram exports for checking the importer
```

Removed 2026-10-08 (to the Trash): `fons/` and `effects/` (old textures, copies
live in `apps/app/public/assets`), `elements/`, `based_ui/`, `troubles/`,
`проверить/`, `Анализ дизайна записной книжки/`,
`Анализ дизайна записной книжки_элементы/`, old debug APKs.

## Tooling / Agent Support Folders

These are not application runtime folders.

```txt
.claude/          # Local Claude/settings
.skills/          # Local skill notes
```

Do not delete these unless you intentionally want to remove local assistant/tooling materials from the project folder.

## Cleanup Guidance

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
