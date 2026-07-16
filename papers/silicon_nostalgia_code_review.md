# Silicon Nostalgia — Комплексное код-ревью

> **Дата:** 2026-07-06
> **Ревизия:** Phase 13 (пост-верификация)
> **Охват:** все исходные файлы `apps/app/src/`, конфигурация, тесты, Tauri shell, CSS

---

## Резюме

Silicon Nostalgia — local-first приложение для заметок с архитектурой строгого разделения ответственности: пять слоёв (UI → ViewModel → Repository → Sync Engine → Automation) + общие контракты. Кодовая база содержит **~12 800 строк** TypeScript/TSX/CSS/SQL в **107 исходных файлах**, **14 тест-файлов** (86 тестов), и включает desktop-сборку через Tauri v2 + PWA.

### Общая оценка

| Критерий | Оценка | Комментарий |
|----------|--------|-------------|
| Архитектурная дисциплина | ⭐⭐⭐⭐⭐ | Безупречное соблюдение слоёв. ESLint boundaries enforce import rules. |
| Типобезопасность | ⭐⭐⭐⭐½ | Zod runtime validation + TypeScript strict. Несколько мест с `unknown`. |
| Тестовое покрытие | ⭐⭐⭐⭐ | 86 тестов, contract test suite, архитектурные тесты. Нет e2e тестов. |
| Обработка ошибок | ⭐⭐⭐½ | Repository и Sync Engine покрывают основные кейсы, но есть пробелы. |
| Безопасность | ⭐⭐⭐⭐ | Хорошая криптосхема. Одна проблема с hardcoded salt в Rust. |
| UI/UX качество | ⭐⭐⭐⭐½ | Впечатляющая дизайн-система, продуманная доступность. |
| Производительность | ⭐⭐⭐½ | Есть потенциальные проблемы с JSON serialization в hot paths. |
| Готовность к production | ⭐⭐⭐ | MVP-уровень; нужна работа над auth, error recovery, code splitting. |

---

## 1. Архитектура и структура проекта

### 1.1 Соблюдение архитектурной доктрины

Архитектурные границы соблюдены **строго**. Это подтверждено:
- ESLint `eslint-plugin-boundaries` конфигурацией в [eslint.config.js](file:///home/sega/Документы/work/umbra%20silico/apps/app/eslint.config.js)
- Автоматическими тестами в [phase-13-verification.test.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/test/phase-13-verification.test.ts) и [architecture.test.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/test/architecture.test.ts)

```
✅ UI → не импортирует Supabase, Dexie, SQLite, Crypto
✅ ViewModel → не импортирует infrastructure напрямую
✅ Repository → не импортирует React/Zustand
✅ Sync Engine → не импортирует UI/ViewModel
✅ Automation → работает только через Repository контракты
```

### 1.2 Структура каталогов

Структура чистая и соответствует спецификации. Каждый слой имеет:
- `contracts/` — интерфейсы и типы
- `index.ts` — public API barrel exports
- Свои тесты в `src/test/`

> [!TIP]
> Хорошее решение: barrel exports через `index.ts` в каждом модуле предотвращают deep imports.

### 1.3 Замечания по структуре

- **Дублирование `App.tsx`**: Существует два файла — [src/App.tsx](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/App.tsx) (1 строка, stub `export { App } from '@/app'`) и [src/app/App.tsx](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/app/App.tsx) (143 строки, основной). Это рабочая схема, но стоит задокументировать, чтобы не путать разработчиков.

---

## 2. Shared Contracts (`src/shared/`)

### 2.1 Что реализовано

| Файл | Строк | Назначение |
|------|-------|------------|
| [note.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/shared/contracts/note.ts) | 180 | Branded IDs, `LocalNote`, `NoteListItem`, discriminated union (plaintext/encrypted) |
| [sync.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/shared/contracts/sync.ts) | 99 | `SyncOperation`, `SyncStatusSnapshot`, `RemoteNoteChange` |
| [document.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/shared/contracts/document.ts) | 73 | `NoteDocument` schema, Tiptap JSON validation |
| [crypto.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/shared/contracts/crypto.ts) | 70 | `NoteEncryptionMetadata`, `CryptoProfile` |
| [automation.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/shared/contracts/automation.ts) | 75 | `AutomationEvent`, `AutomationHandler` |
| [document-v1.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/shared/contracts/document-v1.ts) | 26 | V1 migration anchor |
| [json.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/shared/contracts/json.ts) | 29 | Recursive JSON type + Zod schema |
| [index.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/shared/contracts/index.ts) | 130 | Barrel re-exports |

### 2.2 Сильные стороны

- **Branded types** (`NoteId`, `DeviceId`, `UserId`, `OperationId`) предотвращают случайное смешивание идентификаторов
- **Discriminated union** для `LocalNote` = `PlaintextLocalNote | EncryptedLocalNote` — отличное решение, предотвращает утечку plaintext
- **Zod runtime validation** на всех boundary-точках обеспечивает типобезопасность за пределами compile-time

### 2.3 Замечания

> [!WARNING]
> **JSON.stringify для сравнения (`sameJson`)** — используется в Repository [note-repository.ts:78-80](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/repository/note-repository.ts#L78-L80) и EditorShell. Это O(n) по размеру документа и может быть медленным для больших заметок. Рассмотреть structural comparison или hash.

- `ids.ts` и `time.ts` (по 3 строки каждый) содержат лишь `export {}` — это заглушки для будущего функционала, можно удалить до востребования.

---

## 3. Local Store (`src/local-store/`)

### 3.1 Архитектура двойного адаптера

Реализована стратегия двух хранилищ:

```
LocalNotesStore (interface)
  ├── DexieNotesStore (IndexedDB / PWA)
  └── SqliteNotesStore (SQLite / Tauri desktop)
```

Выбор адаптера осуществляется через фабрику в [local-notes-store-factory.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/local-store/local-notes-store-factory.ts), которая определяет платформу через `detectPlatform()`.

### 3.2 Сильные стороны

- **Единый интерфейс `LocalNotesStore`** с 14 методами, который обе реализации выполняют
- **Атомарные записи**: `putNoteWithOp()` гарантирует, что заметка и outbox-операция записываются в одной транзакции (Dexie transaction / SQLite BEGIN...COMMIT)
- **Contract test suite** [local-notes-store.contract.test.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/test/local-notes-store.contract.test.ts) (660 строк) — одинаковые тесты для обоих адаптеров
- **Serialization layer** [serialization.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/local-store/serialization.ts) нормализует типы между SQLite (string `'0'`/`'1'` для boolean) и Dexie (нативные типы)

### 3.3 Замечания

> [!WARNING]
> **SQLite adapter: SQL injection vector** — В [sqlite-notes-store.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/local-store/sqlite/sqlite-notes-store.ts) все SQL-запросы используют параметризированные placeholders (`$1`, `$2`), что безопасно. Однако stоит добавить comment в коде, подтверждающий это архитектурное решение, для аудита.

> [!NOTE]
> **SQLite schema**: [sqlite-schema.sql](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/local-store/sqlite/sqlite-schema.sql) (69 строк) — чисто написана, индексы по `updated_at`, `sync_status` на месте. Не хватает `PRAGMA journal_mode=WAL` — он критичен для concurrent reads в Tauri, где UI thread и sync thread работают параллельно.

- **Dexie DB** [dexie-db.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/local-store/dexie/dexie-db.ts): версия 1, миграции ещё не нужны, но стоит заранее продумать стратегию миграций IndexedDB.
- **Нет логирования ошибок** в обоих адаптерах — при сбое записи ошибки пропадают без следа.

---

## 4. Repository (`src/repository/`)

### 4.1 Обзор

[DefaultNoteRepository](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/repository/note-repository.ts) (677 строк) — ключевой класс, фасад для всех операций с данными. Это сердце приложения.

### 4.2 Сильные стороны

- **Единый источник истины**: все операции (CRUD, lock/unlock, sync) проходят через Repository
- **Outbox внутри транзакции**: `putNoteWithOp()` гарантирует атомарность
- **Live queries** [live-query.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/repository/live-query.ts) — собственная реализация реактивных запросов через подписки, без зависимости от React
- **Unlocked sessions** — временный in-memory кэш расшифрованного содержимого с TTL (15 минут)
- **Zod validation на входе** — `createNoteInputSchema.parse()`, `updateNotePatchSchema.parse()`

### 4.3 Критические замечания

> [!CAUTION]
> **Утечка памяти в `liveQueries` Set** — Каждый вызов `liveNoteList()` или `liveNote()` добавляет новый `StoreBackedLiveQuery` в `this.liveQueries`, но **нигде нет кода, который удаляет их**. При переключении между заметками live queries будут накапливаться. Нужен cleanup callback в LiveQuery:
> ```ts
> // Пример: при unsubscribe всех слушателей удалять query из Set
> liveQuery.onDestroy(() => this.liveQueries.delete(liveQuery))
> ```

> [!WARNING]
> **`requireCachedMasterKey` с hardcoded `localPin: 'session'`** — В [note-repository.ts:526-532](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/repository/note-repository.ts#L526-L532) при обновлении зашифрованной заметки ключ запрашивается заново через keyring с магическим `localPin: 'session'`. Это ненадёжный механизм и может привести к ошибке, если session не был сохранён.

- **`sameJson` для diff detection** — O(n) JSON.stringify × 2 при каждом refresh, вызывается для всех live queries после каждой мутации. Для больших списков заметок это может создавать заметную задержку.
- **`createPreview`** — рекурсивный обход Tiptap JSON дерева собирает текст и обрезает до 180 символов. Работает, но для сложных вложенных документов может быть медленным.

---

## 5. Sync Engine (`src/sync/`)

### 5.1 Архитектура синхронизации

```
SyncEngine
  ├── OutboxProcessor → push pending ops → RemoteGateway → Supabase
  ├── RemotePull → pull changes by revision → Repository.applyRemoteChange
  ├── RealtimeListener → Supabase Realtime → Repository.applyRemoteChange
  ├── NetworkState → online/offline detection
  └── ConflictPolicy → preserves both versions
```

### 5.2 Сильные стороны

- **Полная автономность**: Sync Engine не импортирует React/Zustand/UI
- **Conflict preservation**: при конфликте сохраняются обе версии (локальная + remote copy с суффиксом)
- **Network awareness**: автоматический переход в offline при потере сети, повторная синхронизация при восстановлении
- **Retry policy** с экспоненциальным backoff в [outbox-processor.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/sync/outbox-processor.ts)
- **Pending sync coalescing**: если синхронизация уже идёт, новый запрос ставится в очередь (`pendingSyncReason`)

### 5.3 Замечания

> [!WARNING]
> **Race condition в `runSync`** — [sync-engine.ts:243-305](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/sync/sync-engine.ts#L243-L305): Флаг `this.syncing` предотвращает параллельные запуски, но `requestSync` вызывается из `handleNetworkChange` и `handleRealtimeChange` без mutex. Если оба события приходят одновременно, `requestSync` может потерять второй `reason` (перезаписывает `pendingSyncReason`).

> [!NOTE]
> **`sync-runner.ts`** — файл из 5 строк, содержит только `export type SyncRunner = 'manual' | 'auto' | 'realtime'`. Похоже на забытый артефакт, тип нигде не используется.

- **Supabase Remote Gateway** [supabase-remote-gateway.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/sync/supabase/supabase-remote-gateway.ts) (234 строки) — хорошо изолирован, работает через typed Supabase client. Error handling покрывает основные кейсы.
- **Supabase config** [supabase-config.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/sync/supabase/supabase-config.ts) — чтение из `import.meta.env` с fallback значениями. Нет валидации наличия обязательных ключей.

---

## 6. Crypto (`src/crypto/`)

### 6.1 Криптографическая модель

| Компонент | Реализация |
|-----------|------------|
| KDF | PBKDF2 (Web Crypto API), 600 000 итераций |
| Symmetric encryption | AES-GCM-256 |
| Key hierarchy | Master Password → Master Key → per-note DEK |
| Key wrapping | AES-KW |

### 6.2 Сильные стороны

- **Per-note DEK**: каждая заметка шифруется отдельным ключом — компрометация одного ключа не раскрывает все данные
- **Nonce generation**: `crypto.getRandomValues()` для IV и salt
- **No plaintext persistence**: зашифрованные заметки хранят только `encryptedPayload` + `encryption` metadata
- **Keyring abstraction** [keyring.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/crypto/keyring.ts) — чистое разделение между key management и encryption operations

### 6.3 Замечания по безопасности

> [!CAUTION]
> **Hardcoded salt в Tauri Stronghold** — [lib.rs:10](file:///home/sega/Документы/work/umbra%20silico/apps/app/src-tauri/src/lib.rs#L10): Rust-код использует фиксированный salt `b"silicon-nostalgia-stronghold-v1"` для Argon2 KDF при инициализации Stronghold. Это ослабляет защиту — salt должен быть уникальным per-user или per-installation. Рекомендация: генерировать и хранить salt при первом запуске.

> [!WARNING]
> **PBKDF2 вместо Argon2id** — В спецификации указан план перехода на Argon2id, но пока используется PBKDF2. Для Web Crypto API это ограничение платформы. Рекомендация: добавить `kdf` field в `CryptoProfile` для миграции (уже реализовано в схеме).

- **600 000 итераций PBKDF2** — разумное значение для 2026 года, но стоит пересмотреть через год.
- **Encoding** [encoding.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/crypto/encoding.ts) — base64 encode/decode через `btoa`/`atob` с `Uint8Array` conversion. Корректно.

---

## 7. Automation Gateway (`src/automation/`)

### 7.1 Текущее состояние

MVP-реализация: in-process event bus без HTTP API (как и задокументировано в плане).

- [automation-gateway.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/automation/automation-gateway.ts) (129 строк) — связывает event bus с Repository notifications
- [event-bus.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/automation/event-bus.ts) (77 строк) — простой pub/sub с типизированными handler-ами

### 7.2 Замечание

- Automation Gateway работает **только через Repository**, что правильно. Тесты в [automation-gateway.test.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/test/automation-gateway.test.ts) подтверждают это.
- Event bus не имеет persistence — события теряются при перезапуске. Для MVP это приемлемо.

---

## 8. ViewModel (`src/viewmodel/`)

### 8.1 Архитектура

| Файл | Строк | Назначение |
|------|-------|------------|
| [app-ui-store.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/viewmodel/app-ui-store.ts) | 26 | Zustand store (ephemeral UI state only) |
| [notes-view-model.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/viewmodel/notes-view-model.ts) | 81 | Note list + CRUD hooks |
| [active-note-view-model.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/viewmodel/active-note-view-model.ts) | 46 | Active note detail + update actions |
| [sync-view-model.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/viewmodel/sync-view-model.ts) | 67 | Sync status subscription |
| [lock-modal-view-model.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/viewmodel/lock-modal-view-model.ts) | 82 | Lock/unlock flow state machine |
| [live-query-view-model.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/viewmodel/live-query-view-model.ts) | 19 | Bridge Repository LiveQuery → React `useSyncExternalStore` |
| [repository-provider.tsx](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/viewmodel/repository-provider.tsx) | 18 | React context provider for Repository |
| [sync-engine-provider.tsx](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/viewmodel/sync-engine-provider.tsx) | 30 | React context provider for SyncEngine |

### 8.2 Сильные стороны

- **Zustand store хранит ТОЛЬКО ephemeral UI state**: `activeNoteId`, `openWindows`, `lockModalNoteId`, `syncBadge` — данные заметок не дублируются
- **`useSyncExternalStore`** для bridge LiveQuery → React — правильный подход, tearing-safe
- **ViewModel hooks** содержат всю координацию, UI компоненты остаются «глупыми»

### 8.3 Замечания

- **`useSyncViewModel`** создаёт `SyncEngine` подписку в каждом компоненте, который её использует. Если несколько компонентов вызывают `useSyncViewModel`, это может создавать лишние подписки. Рассмотреть singleton pattern для sync status.
- **`useActiveNoteViewModel`** [active-note-view-model.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/viewmodel/active-note-view-model.ts) — создаёт новый `liveNote()` при каждом изменении `activeNoteId`. Из-за бага с утечкой live queries (см. §4.3) это усугубляет проблему.

---

## 9. UI Components (`src/ui/`)

### 9.1 Дизайн-система

Основной CSS файл [silicon-nostalgia.css](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/ui/styles/silicon-nostalgia.css) (1758 строк) — впечатляющая работа:

- **CSS Custom Properties**: 20+ design tokens (`--sn-bg`, `--sn-glass`, `--sn-accent`, `--sn-shadow`, etc.)
- **Glassmorphism**: `backdrop-filter: blur()` + полупрозрачные фоны
- **Retro-Mac эстетика**: 1px чёрные borders, dithered scan lines через repeating-linear-gradient, window controls
- **Y2K accents** [y2k-accents.css](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/ui/styles/y2k-accents.css): хром-градиенты, кислотные цвета, calibration strip
- **Responsive layout**: CSS Grid с `minmax()`, media queries для mobile
- **Safe area support**: `env(safe-area-inset-*)` для PWA/мобильных устройств

### 9.2 Компоненты

| Компонент | Строк | Описание |
|-----------|-------|----------|
| [EditorShell.tsx](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/ui/components/notes/EditorShell.tsx) | 609 | Tiptap editor + title, autosave, toolbar, locked state |
| [EmptyStatePlayer.tsx](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/ui/components/notes/EmptyStatePlayer.tsx) | 120 | Skeuomorphic player widget для empty state |
| [NoteCard.tsx](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/ui/components/notes/NoteCard.tsx) | 60 | Note list item card |
| [NoteList.tsx](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/ui/components/notes/NoteList.tsx) | 68 | Scrollable note list + empty state |
| [LockModal.tsx](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/ui/components/notes/LockModal.tsx) | 104 | Password input modal |
| [WorkspaceInspector.tsx](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/ui/components/notes/WorkspaceInspector.tsx) | 76 | Side panel with metadata |
| [GlassPanel.tsx](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/ui/components/silicon/GlassPanel.tsx) | 27 | Polymorphic glass container (`as` prop) |
| [RetroButton.tsx](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/ui/components/silicon/RetroButton.tsx) | 40 | Retro-styled button with variants |
| [PixelIcon.tsx](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/ui/components/silicon/PixelIcon.tsx) | 58 | CSS Grid pixel art icons |
| [WindowFrame.tsx](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/ui/components/silicon/WindowFrame.tsx) | 32 | Mac-style window chrome |
| [ChromeTitlebar.tsx](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/ui/components/silicon/ChromeTitlebar.tsx) | 24 | Industrial chrome header |
| [StatusStrip.tsx](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/ui/components/silicon/StatusStrip.tsx) | 25 | Bottom status bar |

### 9.3 Сильные стороны

- **Архитектурная чистота**: ни один UI компонент не импортирует Supabase, Dexie, SQLite, Crypto
- **Accessibility**: `aria-label`, `role="textbox"`, focus indicators (`outline: 2px solid var(--sn-focus)`), `.sn-sr-only` для screen readers
- **Autosave lifecycle**: debounce (450ms) + flush on blur/pagehide/visibilitychange/beforeunload
- **Empty state**: красивый skeuomorphic player с бэкграундными фотографиями и SVG hello-screen

### 9.4 Замечания

> [!WARNING]
> **EditorShell (609 строк) — самый большой компонент, нуждается в декомпозиции.** Он содержит:
> - EditorToolbar (функциональный компонент внутри файла — хорошо)
> - EditableNoteEditor (функциональный компонент внутри файла — хорошо)
> - Основной EditorShell
> - Вспомогательные функции и типы
>
> Рекомендация: вынести `EditorToolbar` и `EditableNoteEditor` в отдельные файлы.

- **`emptyStateBackgrounds` random selection** — выбор фона происходит на уровне модуля (один раз при загрузке), что означает одинаковый фон до перезагрузки страницы. Это правильное решение (нет re-renders при каждом рендере).

- **`-webkit-line-clamp`** в CSS — legacy webkit-only свойство. Рекомендация: рассмотреть нативный `line-clamp` (CSS spec в процессе, но с fallback).

- **Pixel icon system** — инновационный подход с CSS Grid для пиксельных иконок. Работает, но увеличивает DOM-size для каждой иконки. Для приложения текущего масштаба это не проблема.

- **Три icon-системы** (PixelIcon, ActualIcon, NotionIcon, Y2KIcon): не все используются в UI. Рекомендация: сделать аудит используемых иконок и убрать неиспользуемые.

---

## 10. App Shell и Providers (`src/app/`)

### 10.1 Provider Stack

[providers.tsx](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/app/providers.tsx) (79 строк) — инициализация приложения:

```tsx
AppProviders
  → RepositoryProvider (async init: detectPlatform → createLocalStore → DefaultNoteRepository)
    → SyncEngineProvider (creates SyncEngine with Repository + SupabaseRemoteGateway)
      → children (App workspace)
```

### 10.2 Замечания

- **Async initialization** в providers: хороший подход с loading state (`Calibrating...` text). Однако при ошибке инициализации (например, IndexedDB заблокирован) — показывается только generic error в console, UI зависает на loading.
- **Отсутствует Auth**: Supabase Auth не подключён к UI. `userId` и `deviceId` задаются как `crypto.randomUUID()` при каждом запуске в browser mode — это означает, что при перезагрузке PWA данные будут видны (они в IndexedDB), но userId будет разным. Sync с сервером не заработает без persistent userId.

> [!IMPORTANT]
> **Нет Auth UI** — приложение инициализирует анонимного пользователя при каждом запуске. Это критическая недоработка для sync функциональности. Для local-only использования работает, но sync с Supabase невозможен без аутентификации.

---

## 11. Platform Layer (`src/platform/`)

### 11.1 Обзор

| Файл | Назначение |
|------|------------|
| [platform.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/platform/platform.ts) | `detectPlatform()`: `'tauri'` or `'browser'` |
| [browser-platform.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/platform/browser-platform.ts) | Browser detection stub |
| [tauri-platform.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/platform/tauri-platform.ts) | Tauri detection via `__TAURI_INTERNALS__` |
| [secure-secret-store.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/platform/secure-secret-store.ts) | 122 строки: Stronghold (Tauri) / localStorage fallback |

### 11.2 Замечание о секретах

> [!WARNING]
> **localStorage для секретов в PWA** — [secure-secret-store.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/platform/secure-secret-store.ts) использует `localStorage` как fallback для Tauri Stronghold в браузерном окружении. localStorage не зашифрован и доступен JS-коду на странице. Для MVP это приемлемо, но для production нужна альтернатива (например, CryptoKey stored in IndexedDB with extractable=false).

---

## 12. PWA (`src/pwa/`)

### 12.1 Текущее состояние

- **`vite-plugin-pwa`** сконфигурирован в [vite.config.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/vite.config.ts)
- **`manifest.webmanifest`** [manifest.webmanifest](file:///home/sega/Документы/work/umbra%20silico/apps/app/public/manifest.webmanifest) — корректный, с 192x192, 512x512, maskable icons
- **Service worker registration** [register-service-worker.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/pwa/register-service-worker.ts) — 15 строк, регистрация + update detection
- **PWA readiness tests** [pwa-readiness.test.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/test/pwa-readiness.test.ts) проверяют app-shell caching, manifest, sw.js наличие, offline scenarios

### 12.2 Замечание

- **`display_override: ["window-controls-overlay", "standalone", "minimal-ui"]`** — `window-controls-overlay` не поддерживается на Android. Fallback правильный (`standalone`).
- **`short_name: "Umbra"`** — отличается от product name "Silicon Nostalgia". Стоит согласовать для consistency.

---

## 13. Tauri Desktop (`src-tauri/`)

### 13.1 Конфигурация

- **[tauri.conf.json](file:///home/sega/Документы/work/umbra%20silico/apps/app/src-tauri/tauri.conf.json)**: окно 1200×820, min 920×640, тема Dark, SQLite preload `silicon-nostalgia.db`
- **[Cargo.toml](file:///home/sega/Документы/work/umbra%20silico/apps/app/src-tauri/Cargo.toml)**: `tauri`, `tauri-plugin-sql` (sqlite), `tauri-plugin-stronghold`, `argon2`
- **[capabilities/default.json](file:///home/sega/Документы/work/umbra%20silico/apps/app/src-tauri/capabilities/default.json)**: core, sql (load/execute/select/close), stronghold
- **[lib.rs](file:///home/sega/Документы/work/umbra%20silico/apps/app/src-tauri/src/lib.rs)** (22 строки): Stronghold + SQL plugin initialization
- **[ubuntu-builder.Dockerfile](file:///home/sega/Документы/work/umbra%20silico/apps/app/src-tauri/docker/ubuntu-builder.Dockerfile)**: Ubuntu 24.04, Node 24, Rust, воспроизводимая сборка

### 13.2 Замечания

> [!CAUTION]
> **CSP `null`** — [tauri.conf.json:29](file:///home/sega/Документы/work/umbra%20silico/apps/app/src-tauri/tauri.conf.json#L29): `"csp": null` полностью отключает Content Security Policy. Для production рекомендуется:
> ```json
> "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
> ```

- **Bundle targets**: только `deb` и `appimage`. Для Ubuntu этого достаточно.
- **Dockerfile**: хорошая практика — репродуцируемая сборка, не зависящая от хост-окружения. Однако `dbus-run-session` для headless smoke test в описании есть, но в Dockerfile `dbus` не установлен (установлен только `xvfb`).

---

## 14. Тесты

### 14.1 Обзор тест-сьюта

| Тестовый файл | Строк | Тестов | Описание |
|---------------|-------|--------|----------|
| [local-notes-store.contract.test.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/test/local-notes-store.contract.test.ts) | 660 | ~20 | Contract tests для Dexie + SQLite |
| [sync-engine.test.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/test/sync-engine.test.ts) | 521 | ~15 | Sync lifecycle, offline/online, conflicts |
| [viewmodel.test.tsx](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/test/viewmodel.test.tsx) | 512 | ~12 | ViewModel hooks with mocked Repository |
| [note-repository.test.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/test/note-repository.test.ts) | 444 | ~14 | Repository CRUD, outbox, live queries, conflicts |
| [supabase-remote-gateway.test.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/test/supabase-remote-gateway.test.ts) | 377 | ~10 | Remote gateway mocks |
| [pwa-readiness.test.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/test/pwa-readiness.test.ts) | 280 | ~8 | PWA manifest, sw, offline |
| [ui-shell.test.tsx](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/test/ui-shell.test.tsx) | 260 | ~7 | UI rendering, boundary checks |
| [phase-13-verification.test.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/test/phase-13-verification.test.ts) | 243 | Audit | Architecture boundary enforcement |
| [automation-gateway.test.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/test/automation-gateway.test.ts) | 226 | ~6 | Event bus, gateway lifecycle |
| [tauri-packaging-readiness.test.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/test/tauri-packaging-readiness.test.ts) | 195 | ~5 | Tauri config, capabilities, icons |
| [contracts.test.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/test/contracts.test.ts) | 176 | ~8 | Zod schema validation |
| [architecture.test.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/test/architecture.test.ts) | 98 | ~4 | Import boundary audits |
| [crypto-service.test.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/test/crypto-service.test.ts) | 55 | ~3 | Encrypt/decrypt roundtrip |
| [editor-autosave.test.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/test/editor-autosave.test.ts) | 46 | ~3 | Debounced autosave logic |

**Итого: 14 тестовых файлов, ~4 093 строк тестов, 86 тестов.**

### 14.2 Сильные стороны

- **Contract test suite**: одинаковые тесты для обоих Local Store адаптеров
- **Architectural tests**: автоматическая проверка import boundaries через fs.readFileSync + regex
- **PWA readiness tests**: проверка размеров PNG иконок, наличия sw.js, manifest полноты
- **Mocked dependencies**: тесты sync engine, viewmodel и repository используют моки вместо реальных I/O

### 14.3 Недостающее покрытие

> [!IMPORTANT]
> **Нет End-to-End тестов** — отсутствуют Playwright/Cypress тесты для проверки полного пользовательского сценария (создание заметки → редактирование → lock → unlock → sync).

- **Нет тестов на concurrent writes** — несколько вкладок с одним IndexedDB
- **Нет тестов на corruption recovery** — что если IndexedDB или SQLite повреждены?
- **Crypto tests** (55 строк) — минимальные, только roundtrip. Нет тестов на:
  - Неверный пароль
  - Corrupted ciphertext
  - Key rotation
- **Нет нагрузочных тестов** — как ведёт себя приложение с 10 000 заметками?

---

## 15. Конфигурация и инфраструктура

### 15.1 Обзор

| Файл | Замечания |
|------|-----------|
| [vite.config.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/vite.config.ts) | PWA plugin, path alias `@/` → `src/`, Vitest config |
| [eslint.config.js](file:///home/sega/Документы/work/umbra%20silico/apps/app/eslint.config.js) | `eslint-plugin-boundaries` с 10 зонами |
| [tsconfig.app.json](file:///home/sega/Документы/work/umbra%20silico/apps/app/tsconfig.app.json) | Strict mode, path aliases |
| [package.json](file:///home/sega/Документы/work/umbra%20silico/apps/app/package.json) | 12 deps, 17 devDeps |

### 15.2 Замечания

- **Vite chunk size warning** (упомянут в Phase 13 Report) — основной бандл слишком большой. Рекомендация: dynamic import для Tiptap (он тяжёлый).
- **`oxlint`** используется как дополнительный линтер наравне с ESLint. Хорошая практика для более быстрых проверок.

---

## 16. Утилитарный скрипт

### `scripts/prepare_player_asset.py`

[prepare_player_asset.py](file:///home/sega/Документы/work/umbra%20silico/apps/app/scripts/prepare_player_asset.py) (356 строк) — Python-скрипт для обработки изображения skeuomorphic-плеера:
- Удаление фона (flood fill или rembg)
- Очистка текста на экране
- Ретушь speaker grille (замена отверстий на процедурные)
- Удаление тени
- Export в WebP lossless

Качество скрипта высокое: хорошо параметризирован через argparse, обработка edge cases (bbox = None), clean math для координат.

---

## 17. Сводка рекомендаций

### Критические (исправить до production)

| # | Проблема | Файл | Действие |
|---|---------|------|----------|
| 1 | Утечка памяти в LiveQuery Set | [note-repository.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/repository/note-repository.ts) | Добавить cleanup при unsubscribe |
| 2 | Hardcoded salt в Stronghold Argon2 | [lib.rs](file:///home/sega/Документы/work/umbra%20silico/apps/app/src-tauri/src/lib.rs) | Генерировать per-installation salt |
| 3 | CSP отключён (`null`) | [tauri.conf.json](file:///home/sega/Документы/work/umbra%20silico/apps/app/src-tauri/tauri.conf.json) | Установить restrictive CSP |
| 4 | Нет Auth UI | [providers.tsx](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/app/providers.tsx) | Реализовать Supabase Auth flow |
| 5 | localStorage для секретов в PWA | [secure-secret-store.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/platform/secure-secret-store.ts) | Использовать non-extractable CryptoKey |

### Высокий приоритет

| # | Проблема | Файл | Действие |
|---|---------|------|----------|
| 6 | Race condition в Sync Engine | [sync-engine.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/sync/sync-engine.ts) | Mutex / queue для sync requests |
| 7 | JSON.stringify diff в hot paths | [note-repository.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/repository/note-repository.ts) | Structural comparison или revision check |
| 8 | Нет WAL mode для SQLite | [sqlite-schema.sql](file:///home/sega/Документы/work/umbra%20silico/apps/app/src/local-store/sqlite/sqlite-schema.sql) | Добавить `PRAGMA journal_mode=WAL` |
| 9 | Нет E2E тестов | — | Добавить Playwright tests |
| 10 | Chunk size warning | [vite.config.ts](file:///home/sega/Документы/work/umbra%20silico/apps/app/vite.config.ts) | Code splitting для Tiptap |

### Средний приоритет

| # | Проблема | Действие |
|---|---------|----------|
| 11 | EditorShell 609 строк | Декомпозировать на под-компоненты |
| 12 | sync-runner.ts неиспользуемый тип | Удалить или задокументировать |
| 13 | ids.ts / time.ts пустые заглушки | Удалить до востребования |
| 14 | Три icon-системы | Аудит использования, удалить лишние |
| 15 | Нет логирования ошибок в local-store | Добавить structured logging |
| 16 | Crypto tests минимальные | Расширить: wrong password, corruption, rotation |
| 17 | Supabase env не валидируется | Добавить проверку при старте |

---

## 18. Статистика кодовой базы

```
Слой                    Файлов  Строк    %
─────────────────────── ──────  ─────  ─────
shared/contracts           8     732    5.7%
local-store               12   1,028    8.1%
repository                 9     895    7.0%
sync                      13   1,129    8.8%
crypto                     5     556    4.4%
automation                 3     222    1.7%
viewmodel                 14     503    3.9%
ui (components)           14   1,277   10.0%
ui (styles/CSS)            3   1,855   14.5%
ui (icons)                 8     202    1.6%
ui (editor)                2      69    0.5%
app (shell)                4     246    1.9%
platform                   5     148    1.2%
pwa                        1      15    0.1%
tests                     14   4,093   32.1%
config/infrastructure      -     ~50    0.4%
─────────────────────── ──────  ─────  ─────
ИТОГО                    115  12,970  100.0%
```

---

## 19. Заключение

Silicon Nostalgia — **архитектурно зрелая** кодовая база MVP-уровня. Главная сила проекта — **дисциплинированное разделение слоёв**, подкреплённое ESLint boundaries и автоматическими тестами.

Основные области для работы перед выходом из MVP:
1. **Auth flow** — без него синхронизация невозможна
2. **Memory management** — утечка live queries
3. **Security hardening** — CSP, salt generation, secret storage
4. **Performance** — code splitting, оптимизация diff-detection
5. **E2E testing** — Playwright для критических user flows

Визуальная составляющая (CSS дизайн-система) выполнена на высочайшем уровне — 1758 строк тщательно продуманного CSS создают уникальную и запоминающуюся эстетику.
