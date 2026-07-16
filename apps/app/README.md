# Umbra Silico App

Local-first notes app with an Umbra Silico interface: warm paper surfaces,
Old Mac/Web 1.0 structure and Y2K chrome accents.

## Stack

- Vite
- React
- TypeScript
- Zustand for ephemeral UI state
- Zod for runtime validation of shared contracts
- Vitest for fast contract tests
- ESLint boundaries for architecture checks
- Tauri v2 config skeleton for Ubuntu desktop
- Dexie and Tauri SQL local-store adapters

## Commands

```bash
npm run dev
npm run check
npm run lint
npm run test:run
npm run build
npm run tauri -- --version
```

## Architecture

The codebase is split into five layers:

- `src/ui`: dumb UI components and visual system only
- `src/viewmodel`: ephemeral UI state and ViewModel hooks
- `src/repository`: repository contracts and composition entrypoints
- `src/sync`: autonomous sync engine contracts
- `src/automation`: automation contracts and in-process event bus

Supporting layers:

- `src/shared`: pure contracts, types and utilities
- `src/local-store`: SQLite/Dexie adapter contracts and future implementations
- `src/crypto`: encryption service contracts
- `src/platform`: browser/Tauri runtime detection

## Phase 0 Status

Completed:

- Vite React TypeScript scaffold
- path alias `@/*`
- TypeScript build check
- Vitest runner
- ESLint architectural boundary rules
- Umbra Silico UI shell
- Tauri config skeleton

## Phase 1 Status

Completed:

- branded domain identifiers for notes, users, devices and operations
- document-v1 contract and migration anchor
- Zod schemas for note documents, local notes, sync operations, crypto metadata and automation events
- strict plaintext/encrypted local note discriminated union
- JSON-serializable sync operation payload validation
- contract tests for document, note, sync and automation invariants

## Phase 2 Status

Completed:

- `LocalNotesStore` contract with transactional `putNoteWithOp` and `softDeleteNoteWithOp`
- shared local-store row serialization for Dexie and SQLite
- Dexie/IndexedDB adapter for PWA runtime
- SQLite adapter for Tauri runtime through a thin SQL driver interface
- Tauri SQL plugin wiring in `src-tauri`
- local tables for notes, outbox operations, sync state, crypto profiles and automation events
- runtime factory for browser/Dexie and Tauri/SQLite stores
- common contract test suite covering Dexie and SQLite adapters

## Phase 3 Status

Completed:

- `DefaultNoteRepository` as the application data source facade
- CRUD note operations through Repository
- atomic outbox operation creation inside Repository methods
- store-backed live query primitive without React/Zustand imports
- local-note to sync-payload mapper
- remote snapshot to local-note mapper
- remote apply and conflict marking entrypoints for the future Sync Engine
- repository factory over `LocalNotesStore`
- repository tests for CRUD, outbox, live queries, remote apply and conflicts

## Phase 4 Status

Completed:

- Repository provider and React hook bridge for Repository `LiveQuery`
- `useNotesViewModel`
- `useActiveNoteViewModel`
- `useSyncViewModel`
- `useWindowViewModel`
- Zustand remains UI-only: active note, open windows, lock modal and sync badge
- UI components now read note data through ViewModel hooks
- ViewModel tests with mocked `NoteRepository`

## Phase 5 Status

Completed:

- focused Umbra Silico workspace shell
- Old Mac dithering background and hard 1px black UI borders
- glass panels with `backdrop-filter` surfaces and neo-brutalist shadows
- Y2K chrome titlebar, window controls and industrial status strip
- bitmap-style pixel icons rendered as CSS grid cells
- retro buttons with stable sizes, hover inversion and disabled states
- presentational note list, note cards, editor shell, inspector and lock modal
- responsive desktop/tablet/mobile layout for the notes workspace
- UI boundary rule: `src/ui` can import only UI and shared contracts
- architecture test proving UI components do not import ViewModel, Repository,
  Sync, local-store, Tauri or Supabase modules

## Phase 12 Desktop Packaging Readiness

Implemented:

- Tauri v2 desktop window config for the Ubuntu shell
- SQL plugin preload for `sqlite:silicon-nostalgia.db`
- runtime Tauri/SQLite database name aligned with SQL preload
- Stronghold plugin wiring for secure local secret storage
- explicit desktop capabilities for SQL and Stronghold commands
- generated Tauri desktop icons from the Umbra Silico app icon
- phase 12 readiness tests for config, capabilities, plugins, icons and local
  API default-off behavior
- reproducible Ubuntu builder Dockerfile for machines without local Tauri
  prerequisites
- Ubuntu `.deb` and AppImage artifacts under `src-tauri/target/release/bundle`
- headless desktop smoke test through `xvfb-run` proving the app process starts
  and initializes `silicon-nostalgia.db`

Native build gate:

- `npm run build:tauri` requires the local machine to have Rust/Cargo and
  Tauri Linux prerequisites installed.
- Use `src-tauri/PHASE_12_RELEASE_CHECKLIST.md` for the exact release commands
  and desktop smoke tests.

Known external prerequisites for desktop builds:

- Rust toolchain
- Cargo
- `webkit2gtk-4.1`
- `rsvg2`

These are system-level Tauri requirements and are not installed by this scaffold.

## Phase 13 Verification Pass

Implemented:

- `verify:phase13` command for the repeatable first-pass release gate
- acceptance-checklist audit in `src/test/phase-13-verification.test.ts`
- stronger PWA install readiness checks, including real PNG icon dimensions
- architecture checks for UI, Sync Engine, Automation Gateway and local adapter
  boundaries
- verification report in `PHASE_13_VERIFICATION_REPORT.md`
