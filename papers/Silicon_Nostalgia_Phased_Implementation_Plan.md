# Silicon Nostalgia Phased Implementation Plan

## 0. Назначение документа

Этот документ фиксирует фазовый план реализации **Silicon Nostalgia** с учетом архитектурной доктрины строгого разделения ответственности.

Основной принцип:

```txt
UI не знает о базе данных.
UI State не хранит заметки как дубликат.
Repository является единственным источником истины для данных приложения.
Sync Engine работает автономно и не блокирует интерфейс.
Automation Gateway общается только с Repository через публичные контракты.
```

Документ должен использоваться как рабочий план перед написанием кода и как чеклист архитектурной дисциплины во время реализации.

## 1. Архитектурная доктрина

Кодовая база строится вокруг пяти слоев.

```txt
1. UI Components
2. UI State & ViewModel
3. Data Access Layer / Repository
4. Sync Engine & Outbox
5. Automation Gateway
```

Дополнительно допускается только слой общих контрактов:

```txt
Shared Contracts
```

Он содержит типы, схемы, enum, DTO, pure validators и константы. В нем запрещены React, Zustand, Supabase, SQLite, Dexie, Tauri API и Web Crypto side effects.

## 2. Правила зависимостей

### Разрешенный граф зависимостей

```txt
UI Components
  -> UI State & ViewModel
  -> Repository Contracts

UI State & ViewModel
  -> Repository Contracts

Repository
  -> Local Store Adapters
  -> Crypto Services
  -> Shared Contracts

Sync Engine
  -> Repository Contracts
  -> Supabase Remote Gateway
  -> Shared Contracts

Automation Gateway
  -> Repository Contracts
  -> Shared Contracts

Local Store Adapters
  -> SQLite or Dexie
  -> Shared Contracts

Supabase Remote Gateway
  -> Supabase SDK
  -> Shared Contracts
```

### Запрещенный граф зависимостей

```txt
UI Components -> Supabase
UI Components -> SQLite
UI Components -> Dexie
UI Components -> Web Crypto
UI Components -> Sync Engine internals

UI State -> Supabase
UI State -> SQLite
UI State -> Dexie
UI State -> encrypted payload processing

Sync Engine -> React
Sync Engine -> Zustand
Sync Engine -> UI Components

Automation Gateway -> React
Automation Gateway -> Zustand
Automation Gateway -> Supabase directly for note mutation

Repository -> UI Components
Repository -> Zustand
Repository -> React components
```

### Enforcement

Архитектурные границы должны проверяться не только дисциплиной, но и инструментами.

Рекомендуемые меры:

- `eslint-plugin-boundaries` или аналогичная настройка import boundaries;
- path aliases по слоям;
- отдельные `index.ts` public API на уровне модулей;
- запрет deep imports между фичами;
- тесты репозитория без React;
- тесты Sync Engine без DOM;
- тесты UI через замоканный ViewModel/Repository contract.

## 3. Предлагаемая структура проекта

```txt
apps/
  app/
    index.html
    vite.config.ts
    src/
      main.tsx
      app/
        App.tsx
        providers.tsx
        routes.tsx

      shared/
        contracts/
          note.ts
          document.ts
          sync.ts
          crypto.ts
          automation.ts
        utils/
          ids.ts
          time.ts

      ui/
        components/
          silicon/
            GlassPanel.tsx
            RetroButton.tsx
            PixelIcon.tsx
            WindowFrame.tsx
            ChromeTitlebar.tsx
            RetroScrollbar.css
          notes/
            NoteCard.tsx
            NoteList.tsx
            EditorShell.tsx
            LockModal.tsx
        styles/
          globals.css
          silicon-nostalgia.css
          y2k-accents.css

      viewmodel/
        app-ui-store.ts
        notes-view-model.ts
        sync-view-model.ts
        window-view-model.ts

      repository/
        contracts/
          note-repository.ts
          live-query.ts
        note-repository.ts
        note-repository-factory.ts
        mappers/
          local-note-mapper.ts
          remote-note-mapper.ts

      local-store/
        contracts/
          local-notes-store.ts
        dexie/
          dexie-db.ts
          dexie-notes-store.ts
        sqlite/
          sqlite-schema.sql
          sqlite-notes-store.ts

      crypto/
        crypto-service.ts
        password-kdf.ts
        keyring.ts
        encoding.ts

      sync/
        sync-engine.ts
        sync-runner.ts
        outbox-processor.ts
        remote-pull.ts
        remote-push.ts
        realtime-listener.ts
        network-state.ts
        conflict-policy.ts
        supabase/
          supabase-client.ts
          supabase-remote-gateway.ts

      automation/
        automation-gateway.ts
        event-bus.ts
        local-api/
          local-api-server.ts
          local-api-auth.ts
          handlers.ts

      platform/
        platform.ts
        browser-platform.ts
        tauri-platform.ts

    src-tauri/
      tauri.conf.json
      Cargo.toml
      capabilities/

supabase/
  migrations/
  seed.sql
```

## 4. Контракты слоев

### UI Components

Назначение:

- отрисовка дизайн-системы;
- обработка пользовательского ввода;
- вызов действий из ViewModel;
- подписка на данные через ViewModel/live query hooks.

Запрещено:

- импортировать Supabase SDK;
- импортировать Dexie;
- импортировать Tauri SQL API;
- выполнять crypto-операции;
- держать бизнес-логику синхронизации;
- хранить копию списка заметок в локальном `useState`, если данные приходят из Repository.

Пример допустимой формы:

```tsx
export function NoteListPanel() {
  const { notes, selectNote, activeNoteId } = useNotesViewModel();

  return (
    <div>
      {notes.map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          active={note.id === activeNoteId}
          onSelect={() => selectNote(note.id)}
        />
      ))}
    </div>
  );
}
```

### UI State & ViewModel

Назначение:

- эфемерное состояние интерфейса;
- active note id;
- открытые окна;
- visible modal;
- current route-like UI mode;
- sync badge state;
- transient errors;
- bridge между UI и Repository live queries.

Что нельзя хранить:

- полный список заметок как самостоятельный кэш;
- полный документ активной заметки как дубликат Repository;
- encrypted payload;
- master key;
- outbox operations.

Рекомендуемый Zustand state:

```ts
type AppUiState = {
  activeNoteId: string | null;
  openWindows: string[];
  lockModalNoteId: string | null;
  syncBadge: 'offline' | 'idle' | 'syncing' | 'conflict' | 'error';
  setActiveNote(noteId: string | null): void;
  openLockModal(noteId: string): void;
  closeLockModal(): void;
  setSyncBadge(status: AppUiState['syncBadge']): void;
};
```

### Repository

Назначение:

- единственный источник истины для заметок;
- единый API для UI, Sync Engine и Automation Gateway;
- маршрутизация между SQLite и IndexedDB;
- создание операций Outbox;
- вызов Crypto Service при lock/unlock;
- трансляция live queries.

Публичный контракт:

```ts
export interface NoteRepository {
  liveNoteList(query?: NoteListQuery): LiveQuery<NoteListItem[]>;
  liveNote(noteId: string): LiveQuery<NoteDetail | null>;

  createNote(input: CreateNoteInput): Promise<NoteId>;
  updateNote(noteId: string, patch: UpdateNotePatch): Promise<void>;
  deleteNote(noteId: string): Promise<void>;

  lockNote(noteId: string, credentials: LockCredentials): Promise<void>;
  unlockNoteForSession(noteId: string, credentials: UnlockCredentials): Promise<UnlockedNoteSession>;

  getPendingOps(limit: number): Promise<SyncOperation[]>;
  markOpSynced(opId: string, remoteRevision: number): Promise<void>;
  markOpFailed(opId: string, error: string): Promise<void>;

  applyRemoteChange(change: RemoteNoteChange): Promise<void>;
  markConflict(noteId: string, conflict: ConflictRecord): Promise<void>;
}
```

### Sync Engine & Outbox

Назначение:

- автономный фоновый процесс;
- читает Outbox из Repository;
- пушит изменения в Supabase;
- тянет remote changes;
- слушает Supabase Realtime;
- пишет результат обратно в Repository;
- не блокирует UI.

Sync Engine не должен:

- рендерить UI;
- импортировать React;
- читать Zustand напрямую;
- напрямую изменять IndexedDB/SQLite в обход Repository;
- расшифровывать locked notes.

Публичный контракт:

```ts
export interface SyncEngine {
  start(): Promise<void>;
  stop(): Promise<void>;
  requestSync(reason: SyncReason): void;
  getStatus(): SyncStatusSnapshot;
  subscribe(listener: (status: SyncStatusSnapshot) => void): Unsubscribe;
}
```

### Automation Gateway

Назначение:

- будущие Python-скрипты;
- ИИ-агенты;
- локальные вебхуки;
- импорт/экспорт;
- agent jobs;
- internal automation events.

Automation Gateway имеет доступ только к Repository contract.

Запрещено:

- менять Supabase напрямую;
- менять SQLite/IndexedDB напрямую;
- обходить lock/unlock правила;
- отдавать plaintext locked note без explicit unlock grant;
- импортировать UI или Zustand.

Публичный контракт:

```ts
export interface AutomationGateway {
  start(): Promise<void>;
  stop(): Promise<void>;
  emit(event: AutomationEvent): Promise<void>;
  registerHandler(handler: AutomationHandler): Unsubscribe;
}
```

## 5. Глобальная стратегия реализации

Проект строится снизу вверх:

```txt
Shared Contracts
-> Repository Contracts
-> Local Store Adapters
-> Repository Implementation
-> UI State & ViewModel
-> UI Components
-> Sync Engine
-> Encryption
-> Automation Gateway
-> Tauri/PWA packaging
```

Причина: если сначала написать красивый UI, есть риск случайно протащить в компоненты бизнес-логику, Supabase и local-store детали. Поэтому сначала фиксируются контракты и источник истины.

## 6. Фазы реализации

### Фаза 0. Архитектурные рельсы

Цель: создать каркас проекта и правила, которые не позволят слоям смешиваться.

Работы:

- создать Vite + React + TypeScript проект;
- добавить Tauri v2 wrapper;
- настроить path aliases;
- добавить папки по слоям;
- добавить ESLint import boundary правила;
- добавить базовый test runner;
- создать `shared/contracts`;
- создать пустые public API файлы для каждого слоя.

Deliverables:

- рабочий dev server;
- пустое Tauri-приложение;
- структура каталогов;
- архитектурные aliases;
- документированные import boundaries.

Definition of Done:

- UI не может импортировать `sync`, `local-store`, `crypto`, `supabase`;
- Sync Engine не может импортировать `ui` и `viewmodel`;
- Automation Gateway не может импортировать `ui`, `viewmodel`, `sync`;
- проект собирается.

### Фаза 1. Shared Contracts и доменная модель

Цель: зафиксировать язык системы до реализации инфраструктуры.

Работы:

- описать `NoteId`, `DeviceId`, `UserId`;
- описать `NoteDocumentV1`;
- описать `LocalNote`, `NoteListItem`, `NoteDetail`;
- описать `SyncOperation`;
- описать `RemoteNoteChange`;
- описать `EncryptionMetadata`;
- описать `AutomationEvent`;
- добавить runtime validation через Zod или Valibot.

Deliverables:

- `shared/contracts/note.ts`;
- `shared/contracts/document.ts`;
- `shared/contracts/sync.ts`;
- `shared/contracts/crypto.ts`;
- `shared/contracts/automation.ts`;
- миграционный контракт `document-v1`.

Definition of Done:

- контракты не импортируют UI или infrastructure;
- JSON заметки можно валидировать отдельно от React;
- sync operation serializable;
- encrypted и plaintext note состояния типизированы отдельно.

### Фаза 2. Local Store adapters

Цель: реализовать локальную базу как фундамент local-first приложения.

Работы:

- создать интерфейс `LocalNotesStore`;
- реализовать Dexie adapter для PWA;
- реализовать SQLite adapter для Tauri;
- добавить фабрику выбора adapter по платформе;
- добавить локальные таблицы `notes`, `note_ops`, `sync_state`, `crypto_profiles`, `automation_events`;
- добавить транзакционные методы записи заметки и Outbox операции.

Deliverables:

- `local-store/contracts/local-notes-store.ts`;
- `local-store/dexie/dexie-notes-store.ts`;
- `local-store/sqlite/sqlite-notes-store.ts`;
- `local-store/sqlite/sqlite-schema.sql`;
- unit tests на оба adapter через общий contract test suite.

Definition of Done:

- note create/update/delete работает локально без сети;
- Outbox operation создается в одной транзакции с изменением заметки;
- SQLite и Dexie проходят одинаковые contract tests;
- UI еще не знает о существовании Dexie/SQLite.

### Фаза 3. Repository Implementation

Цель: собрать единый источник истины приложения.

Работы:

- создать `NoteRepository` contract;
- реализовать `DefaultNoteRepository`;
- подключить Local Store adapter;
- реализовать live queries;
- реализовать CRUD заметок;
- реализовать soft delete;
- реализовать Outbox enqueue внутри repository methods;
- добавить мапперы local/remote/domain.

Deliverables:

- `repository/contracts/note-repository.ts`;
- `repository/note-repository.ts`;
- `repository/note-repository-factory.ts`;
- `repository/mappers/*`;
- тесты репозитория.

Definition of Done:

- приложение может создать, прочитать, изменить и удалить заметку через Repository;
- Repository сам пишет Outbox;
- никто вне Repository не пишет напрямую в local store;
- live query обновляется после локальной записи;
- нет импортов React/Zustand внутри Repository.

### Фаза 4. UI State & ViewModel

Цель: создать тонкий слой состояния, который управляет только интерфейсом.

Работы:

- создать Zustand store для UI-only state;
- создать `useNotesViewModel`;
- создать `useActiveNoteViewModel`;
- создать `useSyncViewModel`;
- связать live queries Repository с React hooks;
- добавить actions, которые вызывают Repository methods.

Deliverables:

- `viewmodel/app-ui-store.ts`;
- `viewmodel/notes-view-model.ts`;
- `viewmodel/sync-view-model.ts`;
- тесты ViewModel на mocked Repository.

Definition of Done:

- Zustand не хранит массив заметок как source of truth;
- ViewModel не импортирует Dexie, SQLite или Supabase;
- UI получает данные через ViewModel;
- active note, modal state и sync badge живут в UI state.

### Фаза 5. Silicon Nostalgia UI shell

Цель: собрать интерфейс без бизнес-логики внутри компонентов.

Работы:

- создать app shell;
- реализовать dithering background;
- реализовать glass panels;
- реализовать Y2K chrome titlebar;
- реализовать retro buttons;
- реализовать note list;
- реализовать editor shell;
- реализовать lock modal shell;
- реализовать responsive mobile layout.

Deliverables:

- `ui/components/silicon/*`;
- `ui/components/notes/*`;
- `ui/styles/*`;
- базовая навигация;
- визуальный notes workspace.

Definition of Done:

- компоненты не импортируют Repository implementation;
- компоненты не импортируют Supabase;
- компоненты не импортируют local-store;
- компоненты получают props и ViewModel actions;
- текст не ломается на mobile viewport;
- app shell открывается без сети.

### Фаза 6. Tiptap editor integration

Цель: подключить редактор как UI/control layer поверх Repository.

Работы:

- подключить Tiptap;
- описать editor document schema;
- добавить Markdown-like shortcuts;
- реализовать local autosave debounce;
- сохранять документ через Repository update;
- не хранить документ в Zustand как постоянный кэш.

Deliverables:

- `ui/components/notes/EditorShell.tsx`;
- `features/editor` или `ui/editor` компоненты;
- `shared/contracts/document.ts`;
- editor autosave tests.

Definition of Done:

- ввод текста сохраняется локально;
- закрытие приложения не теряет локальные изменения;
- editor не вызывает Supabase;
- editor не пишет напрямую в Dexie/SQLite.

### Фаза 7. Supabase remote gateway

Цель: изолировать все сетевые детали Supabase в одном инфраструктурном модуле.

Работы:

- создать Supabase client module;
- создать `RemoteNotesGateway`;
- реализовать remote upsert;
- реализовать remote pull by revision;
- реализовать Realtime subscribe;
- добавить Supabase migrations;
- добавить RLS policies.

Deliverables:

- `sync/supabase/supabase-client.ts`;
- `sync/supabase/supabase-remote-gateway.ts`;
- `supabase/migrations/*`;
- tests на gateway с mocked Supabase client.

Definition of Done:

- Supabase SDK импортируется только внутри `sync/supabase` и auth module;
- UI не знает о Supabase;
- Repository не зависит от Supabase SDK;
- remote gateway не зависит от React.

### Фаза 8. Sync Engine & Outbox

Цель: реализовать автономную синхронизацию без блокировки UI.

Работы:

- создать `SyncEngine`;
- реализовать startup sync;
- реализовать push pending operations;
- реализовать pull remote changes;
- реализовать Realtime listener;
- реализовать retry/backoff;
- реализовать network sleep/wake;
- реализовать conflict preservation;
- публиковать sync status через subscribe API.

Deliverables:

- `sync/sync-engine.ts`;
- `sync/outbox-processor.ts`;
- `sync/remote-push.ts`;
- `sync/remote-pull.ts`;
- `sync/realtime-listener.ts`;
- `sync/conflict-policy.ts`;
- integration tests для offline -> online сценария.

Definition of Done:

- UI работает без сети;
- Outbox не теряется после перезапуска;
- remote changes применяются через Repository;
- конфликт не удаляет пользовательский текст;
- Sync Engine не импортирует React/Zustand;
- при падении сети Sync Engine засыпает, UI продолжает работу.

### Фаза 9. Client-side encryption

Цель: реализовать блокировку заметок без утечки plaintext в локальную или удаленную базу.

Работы:

- реализовать Crypto Service;
- реализовать password KDF;
- реализовать master key wrapping;
- реализовать per-note DEK;
- реализовать `lockNote` в Repository;
- реализовать `unlockNoteForSession` в Repository;
- добавить lock modal ViewModel;
- проверить отсутствие plaintext в SQLite/IndexedDB/Supabase.

Deliverables:

- `crypto/crypto-service.ts`;
- `crypto/keyring.ts`;
- `crypto/password-kdf.ts`;
- Repository lock/unlock methods;
- lock/unlock UI flow;
- crypto tests.

Definition of Done:

- locked note хранит только encrypted payload;
- title/preview/body locked note могут быть зашифрованы в privacy-first режиме;
- UI не импортирует crypto module;
- Sync Engine передает encrypted payload как opaque data;
- plaintext locked note не сохраняется после lock.

### Фаза 10. Automation Gateway foundation

Цель: заложить расширяемость для Python-скриптов, ИИ-агентов и локальных вебхуков.

Важно: в первой рабочей версии эта фаза не должна включать запуск локального HTTP API. MVP фиксирует контракты, события и безопасную точку расширения. Реальный local server, Python bridge и agent runtime переносятся в post-MVP.

Работы:

- реализовать internal automation events;
- писать события в локальную таблицу;
- создать Automation Gateway contract;
- создать event dispatcher, который работает только внутри приложения;
- описать будущие read/write handlers как интерфейсы, но не поднимать transport layer;
- добавить запрет plaintext locked notes без unlock grant.

Deliverables:

- `automation/automation-gateway.ts`;
- `automation/event-bus.ts`;
- `shared/contracts/automation.ts`;
- `local-store` support для `automation_events`;
- tests на доступ только через Repository.

Definition of Done:

- Automation Gateway не импортирует UI;
- Automation Gateway не пишет в Supabase напрямую;
- Automation Gateway не пишет в SQLite/IndexedDB напрямую;
- все изменения идут через Repository и Outbox;
- local HTTP API отсутствует в MVP;
- future local API описан контрактом, но не реализован как сервер.

Post-MVP extension:

- feature flag для desktop local API;
- локальная token auth модель;
- local HTTP server на `127.0.0.1:<random-port>`;
- Python/AI handlers;
- explicit unlock grants для доступа к plaintext locked notes.

### Фаза 11. PWA packaging

Цель: сделать мобильный web-клиент installable и offline-ready.

Работы:

- добавить `vite-plugin-pwa`;
- настроить manifest;
- настроить app shell caching;
- проверить offline launch;
- проверить IndexedDB persistence;
- проверить mobile editor ergonomics.

Deliverables:

- `manifest.webmanifest`;
- service worker config;
- icons;
- mobile layout verification.

Definition of Done:

- PWA открывается без сети после установки;
- заметки читаются из IndexedDB;
- ввод текста сохраняется offline;
- sync flush происходит после reconnect.

### Фаза 12. Tauri desktop packaging

Цель: собрать Ubuntu desktop-приложение.

Работы:

- настроить Tauri capabilities;
- подключить SQL plugin;
- подключить secure local secret storage;
- настроить window chrome;
- проверить SQLite persistence;
- проверить desktop build.

Deliverables:

- `src-tauri/tauri.conf.json`;
- SQL plugin config;
- desktop icon;
- Ubuntu build artifact.

Definition of Done:

- приложение запускается как desktop app;
- SQLite работает;
- заметки сохраняются после перезапуска;
- sync работает как фоновой процесс;
- local API остается выключенным по умолчанию.

### Фаза 13. Verification pass

Цель: проверить, что архитектура и продуктовые требования выдержаны.

Работы:

- архитектурный import audit;
- offline editing test;
- reconnect sync test;
- conflict preservation test;
- encryption persistence test;
- UI responsive test;
- PWA install test;
- Tauri build test.

Acceptance checklist:

```txt
[ ] UI does not import Supabase.
[ ] UI does not import Dexie or SQLite.
[ ] UI does not import Crypto Service.
[ ] Zustand does not store notes as source of truth.
[ ] Repository owns local write path.
[ ] Sync Engine uses Repository, not local DB directly.
[ ] Automation Gateway uses Repository, not local DB directly.
[ ] Locked notes do not persist plaintext.
[ ] App opens offline.
[ ] Editor saves offline.
[ ] Outbox flushes after reconnect.
[ ] Conflicts preserve both versions.
```

## 7. Рекомендуемый порядок написания кода

Практический порядок задач:

```txt
1. Scaffold Vite/Tauri.
2. Configure aliases and boundaries.
3. Add shared contracts.
4. Add LocalNotesStore interface.
5. Implement Dexie adapter.
6. Implement SQLite adapter.
7. Implement Repository.
8. Add ViewModel hooks and Zustand UI store.
9. Build UI shell.
10. Add Tiptap editor.
11. Add Supabase remote gateway.
12. Add Sync Engine.
13. Add Crypto Service and lock/unlock.
14. Add Automation Gateway contracts.
15. Add PWA packaging.
16. Add Tauri packaging.
17. Run verification pass.
```

## 8. Риски и решения

### Риск: Live Queries вызовут лишние перерисовки

Проблема:

- Repository live queries и React hooks могут начать отдавать новые ссылки на массивы/объекты при каждом тике;
- note list может перерисовываться целиком при изменении одной заметки;
- Tiptap editor может получать лишние props updates и терять плавность ввода;
- Dexie live queries и SQLite polling/subscription adapters могут вести себя по-разному.

Решение:

- ViewModel hooks должны отдавать стабильные структуры и минимальные slices;
- list query возвращает только `NoteListItem`, без полного документа;
- active note query подписывается только на одну заметку;
- использовать shallow equality / structural sharing;
- мемоизировать derived values;
- не создавать inline callbacks в больших списках без необходимости;
- измерять render count в dev-режиме;
- добавить performance tests для списка заметок и editor autosave.

Watchpoint:

```txt
Мост Repository Live Query -> React должен обновлять UI только при фактическом изменении данных.
```

### Риск: дублирование данных в Zustand

Решение:

- Zustand хранит только UI state;
- note list и note document идут из Repository live queries;
- eslint rule запрещает импорт local-store в viewmodel.

### Риск: Sync Engine начнет обходить Repository

Решение:

- Sync Engine получает только `NoteRepository` interface;
- local-store adapters не экспортируются за пределы Repository composition root;
- contract tests проверяют remote apply через Repository.

### Риск: UI начнет делать Supabase-запросы

Решение:

- Supabase SDK живет только в `sync/supabase` и `auth`;
- UI получает auth/sync состояние через ViewModel;
- import boundary rule запрещает `@/sync` и `@/local-store` внутри `@/ui`.

### Риск: locked note plaintext попадет в локальную базу

Решение:

- lock operation выполняется внутри Repository;
- после lock plaintext document очищается в той же транзакции;
- tests читают raw SQLite/IndexedDB rows и проверяют отсутствие known plaintext.

### Риск: Automation Gateway станет вторым backend

Решение:

- Automation Gateway не имеет доступа к Supabase mutation API;
- все операции идут через Repository;
- agent writes создают обычные local operations и Outbox entries.

Scope control:

- в первой рабочей версии реализуются только контракты Automation Gateway;
- добавляется internal event bus;
- события можно писать в локальную таблицу;
- локальный HTTP server не входит в MVP;
- Python/AI integration handlers остаются следующей итерацией.

Watchpoint:

```txt
Фаза 10 не должна превратиться в отдельный backend-проект внутри MVP.
```

### Риск: Tauri desktop testing окажется слабым местом

Проблема:

- нативный бинарник сложнее тестировать, чем web runtime;
- SQLite plugin, permissions, filesystem paths и secure storage зависят от ОС;
- GUI e2e для desktop дороже и хрупче обычных unit/integration tests.

Решение:

- максимальный объем логики держать вне Tauri shell;
- покрывать business logic contract tests на уровне Repository, Local Store и Sync Engine;
- SQLite adapter тестировать через общий `LocalNotesStore` contract suite;
- Tauri-specific code держать в тонком `platform/tauri` adapter;
- desktop smoke tests ограничить запуском приложения, открытием DB, созданием заметки и перезапуском;
- permissions/capabilities проверять отдельным checklist перед release.

Watchpoint:

```txt
Tauri shell должен быть тонким. Все, что можно проверить без native binary, проверяется без native binary.
```

## 8.1. Performance watchpoints

Эти пункты нужно проверять на каждой фазе, где появляется UI или reactive data flow.

```txt
[ ] Note list не перерисовывается целиком при каждом editor keystroke.
[ ] Active editor не получает новый document prop без реального изменения.
[ ] ViewModel не создает новый массив заметок на каждый render.
[ ] Live query подписки корректно отписываются при unmount.
[ ] Autosave debounce не запускает cascade updates.
[ ] Sync status updates не триггерят перерисовку editor tree.
[ ] Locked note unlock не оставляет plaintext в long-lived UI state.
```

## 8.2. Desktop testing watchpoints

```txt
[ ] Repository tests проходят без Tauri runtime.
[ ] Sync Engine tests проходят без Tauri runtime.
[ ] SQLite adapter tests изолированы от пользовательской DB.
[ ] Tauri capabilities проверены отдельно.
[ ] Desktop smoke test покрывает create/edit/restart/read.
[ ] Secure storage проверен отдельно от crypto-core.
```

## 8.3. Automation scope watchpoints

```txt
[ ] В MVP есть Automation contracts.
[ ] В MVP есть internal event bus.
[ ] В MVP есть локальная таблица automation_events.
[ ] В MVP нет включенного local HTTP API.
[ ] В MVP нет agent runtime.
[ ] Любые будущие automation writes идут только через Repository.
```

## 9. Definition of Architecture Done

Архитектура считается готовой к активной разработке UI и функций, когда:

- есть рабочий Repository contract;
- есть минимум одна local-store реализация;
- есть live query механизм;
- есть Outbox;
- UI state отделен от note data;
- Sync Engine запускается независимо от UI;
- import boundaries настроены;
- locked note model типизирована;
- Automation Gateway имеет контракт, но не вмешивается в UI.

## 10. Итоговая формула

```txt
Silicon Nostalgia =
  dumb UI
  + thin ViewModel
  + authoritative Repository
  + durable Local Store
  + autonomous Sync Engine
  + isolated Automation Gateway
  + encrypted locked notes
  + glass/Y2K retro interface
```

Эта архитектура дает приложению главное свойство: интерфейс остается быстрым и выразительным, данные остаются надежными, а будущая автоматизация не ломает базовую модель продукта.
