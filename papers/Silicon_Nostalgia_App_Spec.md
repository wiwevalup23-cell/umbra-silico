# Silicon Nostalgia Notes

## Revised Architecture Plan

Этот документ описывает техническое ТЗ и архитектурный план для приложения-записной книжки **Silicon Nostalgia** после пересмотра первоначальных решений.

Главные исправления:

- **Next.js заменен на Vite + React + TypeScript**.
- **Local-first архитектура становится обязательной с первого этапа**, а не откладывается на будущее.
- **Supabase больше не является источником истины для интерфейса**. Он используется как удаленная реплика, auth-провайдер и транспорт синхронизации.
- Визуальный язык расширен: Old Mac + Glassmorphism дополняются аккуратными **Y2K / Windows 98 / industrial web** акцентами.
- В архитектуру добавлен слой **Automation Gateway** для будущих Python-скриптов, локальных вебхуков и ИИ-агентов.

## 1. Концепция продукта

**Silicon Nostalgia** - кроссплатформенное приложение для заметок, работающее:

- как desktop-приложение на Ubuntu через Tauri;
- как PWA на смартфонах;
- как локально-устойчивый редактор, который мгновенно открывается и сохраняет текст даже без сети.

Визуально продукт сочетает:

- современный Glassmorphism;
- Old Macintosh System 7 / OS 9;
- ранний Web 1.0;
- Windows 98 / late-90s utility UI;
- Y2K chrome, pixel artifacts и индустриальные кислотные акценты.

Приложение должно ощущаться не как ретро-игрушка, а как дорогой, странный и очень точный инструмент: ностальгичный снаружи, надежный внутри.

## 2. Ключевые архитектурные решения

### Решение 1. Vite вместо Next.js

Первоначальная идея с Next.js в режиме static export технически рабочая, но не лучшая для этого продукта.

Next.js силен там, где нужны:

- SSR;
- Server Components;
- сложная маршрутизация;
- full-stack endpoints;
- edge/server runtime;
- SEO-ориентированные страницы.

Для Silicon Nostalgia эти преимущества почти не используются. Приложение является клиентским редактором, который должен собираться в desktop binary и PWA. Поэтому Next.js добавляет лишний слой абстракций и ограничений.

**Исправленное решение:**

```txt
Vite + React + TypeScript
```

Почему это лучше:

- Vite быстрее стартует в dev-режиме;
- проще интегрируется с Tauri;
- не требует server runtime;
- кодовая база получается чище;
- PWA и desktop build строятся из одного клиентского приложения;
- меньше риска упереться в особенности static export.

Для маршрутизации достаточно:

```txt
React Router или TanStack Router
```

Для этого проекта предпочтительнее **React Router**, потому что маршрутов немного, а требования к data-loading должны жить не в роутере, а в local-first storage layer.

### Решение 2. Local-first с первого дня

Для приложения, где пользователь пишет текст, нельзя полагаться на прямое сохранение в Supabase как основной путь. Набор текста должен быть мгновенным и надежным при любом состоянии сети.

**Исправленное решение:**

```txt
UI -> Local Database -> Sync Engine -> Supabase
```

Локальная база данных - единственный источник истины для интерфейса.

Supabase - удаленная реплика, auth layer и sync transport.

Это означает:

- приложение открывается без сети;
- заметки читаются из локальной базы;
- каждая буква сохраняется локально;
- изменения складываются в durable outbox;
- sync engine отправляет операции в Supabase, когда сеть доступна;
- входящие изменения из Supabase применяются в локальную базу;
- интерфейс не блокируется из-за сети.

### Решение 3. Две локальные базы, один storage API

Для разных платформ нужны разные оптимальные хранилища.

На desktop через Tauri:

```txt
SQLite через tauri-plugin-sql
```

На PWA:

```txt
IndexedDB через Dexie
```

Это добавляет сложность, но она оправдана. SQLite надежнее для desktop, хорошо подходит для локальных скриптов и будущей автоматизации. IndexedDB является естественным браузерным хранилищем для PWA.

Чтобы не размазывать платформенные детали по приложению, нужен общий интерфейс:

```ts
interface LocalNotesStore {
  listNotes(): Promise<NoteListItem[]>;
  getNote(id: string): Promise<LocalNote | null>;
  putNote(note: LocalNote): Promise<void>;
  softDeleteNote(id: string): Promise<void>;
  enqueueOp(op: SyncOperation): Promise<void>;
  listPendingOps(limit: number): Promise<SyncOperation[]>;
  markOpSynced(opId: string): Promise<void>;
  getSyncState(key: string): Promise<string | null>;
  setSyncState(key: string, value: string): Promise<void>;
}
```

Реализации:

```txt
DexieNotesStore
SqliteNotesStore
```

Компоненты React не знают, где лежат данные. Они работают только с repository/service layer.

### Решение 4. Supabase остается, но меняет роль

Supabase по-прежнему подходит проекту:

- Auth;
- Postgres;
- Row Level Security;
- Realtime;
- хранение удаленной реплики;
- будущие Edge Functions для webhooks/agents.

Но Supabase не должен быть runtime-зависимостью для набора текста. Если Supabase недоступен, приложение продолжает работать.

## 3. Финальный стек

### Frontend

```txt
Vite + React + TypeScript
```

Дополнительно:

- React Router для экранов;
- Zustand или Jotai для UI state;
- TanStack Query не обязателен, потому что основным async source будет local store, а не remote API;
- Tiptap для редактора;
- Tailwind CSS + custom CSS variables для дизайн-системы.

### Desktop

```txt
Tauri v2 + Vite + React
```

Desktop capabilities:

- SQLite через Tauri SQL plugin;
- Stronghold или OS keychain для локальных секретов;
- локальный Automation Gateway;
- file import/export;
- будущие sidecar-процессы для Python/AI tooling.

### Mobile

```txt
PWA + IndexedDB
```

PWA capabilities:

- offline launch через service worker;
- локальная база IndexedDB;
- background sync при возможности;
- installable app shell;
- mobile-first editor viewport.

### PWA

```txt
vite-plugin-pwa + Workbox
```

Назначение:

- кэшировать app shell;
- отдавать интерфейс без сети;
- управлять manifest/icons;
- не смешивать app-shell caching с синхронизацией заметок.

Важно: service worker отвечает за доступность приложения, но не является единственным механизмом сохранения данных. Заметки сохраняются в IndexedDB.

### Local Storage

Desktop:

```txt
SQLite
```

PWA:

```txt
IndexedDB + Dexie
```

Почему Dexie:

- аккуратная типизация;
- транзакции поверх IndexedDB;
- live queries для React;
- удобные индексы;
- меньше ручного IndexedDB boilerplate.

### Backend / Remote Sync

```txt
Supabase Auth + Postgres + Realtime + RLS
```

Supabase хранит:

- удаленные копии заметок;
- encrypted payload для locked notes;
- crypto profile пользователя;
- sync metadata;
- automation events и agent jobs в будущих версиях.

### Editor

```txt
Tiptap
```

MVP-возможности:

- headings;
- paragraphs;
- bullet/ordered lists;
- bold;
- italic;
- blockquote;
- code marks/blocks по желанию;
- Markdown-like shortcuts;
- JSON document storage.

Полноценный block editor можно строить поверх Tiptap JSON позже.

### Encryption

```txt
Web Crypto API
AES-GCM
PBKDF2 for MVP
Argon2id later
```

Модель:

- master password защищает master key;
- каждая locked note получает отдельный DEK;
- Supabase никогда не видит plaintext locked note;
- локальная база тоже не должна хранить plaintext locked note после блокировки.

PIN:

- только локальный quick unlock;
- не заменяет master password;
- не используется как единственный источник ключа для облачного шифрования.

## 4. Архитектура проекта

```txt
apps/
  app/
    index.html
    vite.config.ts
    src/
      main.tsx
      app/
        App.tsx
        router.tsx
        providers.tsx
      components/
        silicon/
          GlassPanel.tsx
          RetroButton.tsx
          PixelIcon.tsx
          WindowFrame.tsx
          ChromeTitlebar.tsx
          RetroScrollbar.css
      features/
        auth/
          auth-service.ts
          auth-store.ts
        notes/
          components/
          notes-repository.ts
          notes-service.ts
          notes-types.ts
        editor/
          Editor.tsx
          editor-schema.ts
          markdown-shortcuts.ts
        crypto/
          crypto-core.ts
          keyring.ts
          password-kdf.ts
          encoding.ts
        local-store/
          local-notes-store.ts
          dexie/
            dexie-db.ts
            dexie-notes-store.ts
          sqlite/
            sqlite-schema.sql
            sqlite-notes-store.ts
        sync/
          sync-engine.ts
          outbox.ts
          pull-remote.ts
          push-local.ts
          conflict-resolution.ts
          realtime-listener.ts
        automation/
          automation-events.ts
          local-api.ts
          webhook-registry.ts
      lib/
        supabase/
          client.ts
          remote-schema.ts
        platform/
          platform.ts
          tauri.ts
          browser.ts
      styles/
        globals.css
        silicon-nostalgia.css
        y2k-accents.css
    public/
      manifest.webmanifest
      icons/
    src-tauri/
      tauri.conf.json
      Cargo.toml
      capabilities/

packages/
  editor-schema/
    src/
      document-v1.ts
      migrations.ts
  crypto-core/
    src/
      encryption.ts
      encoding.ts
      kdf.ts
  automation-contracts/
    src/
      events.ts
      local-api.ts
      webhooks.ts

supabase/
  migrations/
  seed.sql
```

## 5. Local-first data model

### Главный принцип

Интерфейс читает только локальные данные.

```txt
React Components
  -> Notes Repository
    -> LocalNotesStore
      -> SQLite or IndexedDB
```

Синхронизация работает отдельно:

```txt
Sync Engine
  -> reads local outbox
  -> pushes to Supabase
  -> pulls remote changes
  -> writes back to local DB
```

### Локальные таблицы

Минимальный набор:

```txt
notes
note_ops
sync_state
crypto_profiles
devices
automation_events
settings
```

### Локальная таблица notes

Единая логическая модель для SQLite и IndexedDB:

```ts
type LocalNote = {
  id: string;
  userId: string;
  schemaVersion: number;

  title: string | null;
  preview: string | null;
  isLocked: boolean;

  document: unknown | null;
  encryptedPayload: string | null;
  encryption: NoteEncryptionMetadata | null;

  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;

  localRevision: number;
  remoteRevision: number | null;
  baseRemoteRevision: number | null;

  syncStatus: 'synced' | 'dirty' | 'syncing' | 'conflict' | 'error';
  lastOpId: string | null;
  deviceId: string;
};
```

### Outbox операций

Каждое локальное изменение пишет операцию в `note_ops`.

```ts
type SyncOperation = {
  opId: string;
  noteId: string;
  userId: string;
  deviceId: string;
  type:
    | 'note.create'
    | 'note.update'
    | 'note.delete'
    | 'note.lock'
    | 'note.unlock';
  payload: unknown;
  baseRemoteRevision: number | null;
  createdAt: string;
  attemptCount: number;
  lastError: string | null;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
};
```

Почему outbox обязателен:

- изменения не теряются при закрытии приложения;
- можно повторять отправку после сетевых ошибок;
- операции становятся идемпотентными через `opId`;
- проще диагностировать sync-проблемы.

### Sync state

```ts
type SyncState = {
  key: 'notes:last_server_revision' | 'auth:last_user_id';
  value: string;
  updatedAt: string;
};
```

## 6. Локальная SQLite схема

Для Tauri desktop:

```sql
create table if not exists notes (
  id text primary key,
  user_id text not null,
  schema_version integer not null,

  title text,
  preview text,
  is_locked integer not null default 0,

  document text,
  encrypted_payload text,
  encryption text,

  created_at text not null,
  updated_at text not null,
  deleted_at text,

  local_revision integer not null default 0,
  remote_revision integer,
  base_remote_revision integer,

  sync_status text not null default 'dirty',
  last_op_id text,
  device_id text not null
);

create index if not exists notes_updated_idx
on notes (updated_at desc);

create index if not exists notes_sync_status_idx
on notes (sync_status);

create table if not exists note_ops (
  op_id text primary key,
  note_id text not null,
  user_id text not null,
  device_id text not null,
  type text not null,
  payload text not null,
  base_remote_revision integer,
  created_at text not null,
  attempt_count integer not null default 0,
  last_error text,
  status text not null default 'pending'
);

create index if not exists note_ops_status_idx
on note_ops (status, created_at);

create table if not exists sync_state (
  key text primary key,
  value text not null,
  updated_at text not null
);

create table if not exists crypto_profiles (
  user_id text primary key,
  version integer not null,
  kdf text not null,
  kdf_params text not null,
  salt text not null,
  wrapped_master_key text not null,
  wrap_nonce text not null,
  updated_at text not null
);

create table if not exists automation_events (
  id text primary key,
  user_id text not null,
  note_id text,
  event_type text not null,
  payload text not null,
  created_at text not null,
  delivered_at text
);
```

## 7. IndexedDB / Dexie схема

Для PWA:

```ts
const db = new Dexie('silicon-nostalgia') as Dexie & {
  notes: EntityTable<LocalNote, 'id'>;
  noteOps: EntityTable<SyncOperation, 'opId'>;
  syncState: EntityTable<SyncState, 'key'>;
  cryptoProfiles: EntityTable<LocalCryptoProfile, 'userId'>;
  automationEvents: EntityTable<AutomationEvent, 'id'>;
};

db.version(1).stores({
  notes:
    'id, userId, updatedAt, deletedAt, isLocked, syncStatus, remoteRevision',
  noteOps:
    'opId, noteId, userId, status, createdAt',
  syncState:
    'key',
  cryptoProfiles:
    'userId',
  automationEvents:
    'id, userId, noteId, eventType, createdAt, deliveredAt'
});
```

React-компоненты должны использовать live queries из repository layer, чтобы UI обновлялся сразу после локальной транзакции.

## 8. Supabase remote schema

### user_crypto

```sql
create table public.user_crypto (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version int not null default 1,
  kdf text not null,
  kdf_params jsonb not null,
  salt text not null,
  wrapped_master_key text not null,
  wrap_nonce text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### devices

```sql
create table public.devices (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  platform text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
```

### notes

Remote `notes` хранит последнюю серверную версию заметки.

```sql
create sequence public.notes_revision_seq;

create table public.notes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,

  schema_version int not null default 1,
  title text,
  preview text,
  is_locked boolean not null default false,

  document jsonb,
  encrypted_payload text,
  encryption jsonb,

  client_updated_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  server_revision bigint not null default nextval('public.notes_revision_seq'),

  last_op_id uuid,
  device_id uuid,
  deleted_at timestamptz,

  check (
    (is_locked = false and document is not null and encrypted_payload is null)
    or
    (is_locked = true and document is null and encrypted_payload is not null and encryption is not null)
  )
);
```

### revision trigger

```sql
create or replace function public.bump_note_revision()
returns trigger
language plpgsql
as $$
begin
  new.server_revision = nextval('public.notes_revision_seq');
  new.server_updated_at = now();
  return new;
end;
$$;

create trigger notes_bump_revision
before update on public.notes
for each row
execute function public.bump_note_revision();
```

### indexes

```sql
create index notes_user_revision_idx
on public.notes (user_id, server_revision);

create index notes_user_updated_idx
on public.notes (user_id, server_updated_at desc)
where deleted_at is null;

create index notes_user_locked_idx
on public.notes (user_id, is_locked)
where deleted_at is null;
```

### automation_events

Для будущих webhook/agent сценариев:

```sql
create table public.automation_events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid references public.notes(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
```

### agent_jobs

```sql
create table public.agent_jobs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid references public.notes(id) on delete set null,
  type text not null,
  status text not null default 'queued',
  input jsonb not null,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## 9. Row Level Security

```sql
alter table public.notes enable row level security;
alter table public.user_crypto enable row level security;
alter table public.devices enable row level security;
alter table public.automation_events enable row level security;
alter table public.agent_jobs enable row level security;

create policy "Users manage own notes"
on public.notes
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage own crypto"
on public.user_crypto
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage own devices"
on public.devices
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage own automation events"
on public.automation_events
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage own agent jobs"
on public.agent_jobs
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
```

## 10. Sync engine

### Startup flow

```txt
1. App starts.
2. UI renders immediately from local DB.
3. Auth session is restored if available.
4. Sync engine starts in background.
5. Engine pushes pending outbox operations.
6. Engine pulls remote changes since last server_revision.
7. Engine subscribes to Supabase Realtime.
8. Incoming remote changes are applied to local DB.
```

### Save flow

```txt
1. User types in editor.
2. Editor state is debounced.
3. Note is saved to local DB transactionally.
4. note_ops receives note.update operation.
5. UI updates from local DB immediately.
6. Sync engine sends operation later.
```

Recommended debounce:

```txt
local save: 300-800 ms
remote sync: 1000-3000 ms or idle/network-aware
```

### Pull remote changes

```sql
select *
from public.notes
where user_id = auth.uid()
  and server_revision > :last_server_revision
order by server_revision asc
limit 500;
```

Each applied remote row updates `notes:last_server_revision`.

### Push local changes

For each pending operation:

1. Read note from local DB.
2. Upsert into Supabase using `id` as stable client-generated UUID.
3. Include `last_op_id`.
4. On success, update local `remoteRevision`, mark op as synced.
5. On failure, keep operation pending and retry with backoff.

### Conflict handling for MVP

MVP strategy:

- if local note is dirty and remote revision changed from a different device, mark `syncStatus = 'conflict'`;
- keep both versions;
- create a duplicate note with suffix `Conflict copy`;
- never silently discard user text.

Later strategy:

- Yjs/CRDT for rich collaborative editing;
- per-block merge;
- remote operation log instead of only latest state.

## 11. Document format

Open note:

```json
{
  "schemaVersion": 1,
  "editor": "tiptap",
  "content": {
    "type": "doc",
    "content": []
  }
}
```

Locked note:

- `document = null`;
- `encrypted_payload` contains encrypted serialized JSON document;
- `encryption` contains metadata.

Recommended privacy mode:

- for locked notes, encrypt body, title and preview;
- in lists show `Locked note` unless a local unlocked session exists;
- search locked notes only after unlock.

## 12. Encryption model

### Entities

- **Master password** - known only to user.
- **Master key** - random user key.
- **Note DEK** - random per-note encryption key.
- **Wrapped master key** - master key encrypted with password-derived wrapping key.
- **Encrypted payload** - encrypted note JSON.

### Crypto profile creation

```txt
1. User enters master password.
2. App generates random masterKey.
3. App derives wrappingKey from password + salt.
4. App encrypts masterKey with wrappingKey.
5. App stores wrappedMasterKey, salt and kdf params locally and remotely.
```

### Lock note

```txt
1. App serializes note document.
2. App generates noteDek.
3. App encrypts document with noteDek.
4. App wraps noteDek with masterKey.
5. App writes encrypted note to local DB.
6. App queues note.lock operation.
7. Sync later sends encrypted payload to Supabase.
```

### Unlock note

```txt
1. User enters master password or local PIN.
2. App unwraps masterKey.
3. App unwraps noteDek.
4. App decrypts note payload in memory.
5. Editor receives plaintext document.
```

Important local rule:

Locked notes must not persist plaintext in SQLite/IndexedDB. Plaintext may exist only in memory during an unlocked session, unless user explicitly unlocks permanently.

## 13. Automation Gateway

Архитектура должна заранее предусмотреть внешние скрипты и ИИ-агентов.

Use cases:

- Python-скрипт сортирует заметки по папкам/тегам;
- локальный агент суммаризирует записи;
- cron-задача ищет незавершенные TODO;
- внешний классификатор добавляет metadata;
- пользователь экспортирует notes JSON для анализа.

### Internal events

Каждое важное действие порождает событие:

```ts
type AutomationEvent =
  | { type: 'note.created'; noteId: string }
  | { type: 'note.updated'; noteId: string; changedFields: string[] }
  | { type: 'note.deleted'; noteId: string }
  | { type: 'note.locked'; noteId: string }
  | { type: 'note.unlocked'; noteId: string }
  | { type: 'sync.conflict'; noteId: string };
```

События пишутся в локальную `automation_events` и, если включено, реплицируются в Supabase.

### Desktop local API

Для Tauri desktop можно добавить локальный API, выключенный по умолчанию:

```txt
127.0.0.1:<random-port>/v1
```

Security requirements:

- API выключен по умолчанию;
- включается пользователем в настройках;
- требует локальный токен;
- токен хранится в Stronghold/keychain;
- locked notes не отдаются в plaintext без явного unlock grant;
- все write-операции проходят через тот же local store и outbox.

Possible endpoints:

```txt
GET    /v1/notes
GET    /v1/notes/:id
POST   /v1/notes
PATCH  /v1/notes/:id
DELETE /v1/notes/:id
POST   /v1/notes/:id/actions/lock
POST   /v1/notes/:id/actions/unlock-session
GET    /v1/events
POST   /v1/agent-jobs
GET    /v1/agent-jobs/:id
```

### PWA automation

PWA не может надежно поднимать локальный HTTP endpoint. Для web/mobile сценариев:

- export/import JSON;
- Supabase-backed `automation_events`;
- Supabase Edge Functions для внешних webhooks;
- Web Share Target позже;
- deep links позже.

### Agent jobs

ИИ-агенты не должны напрямую менять remote DB. Они должны создавать job или локальную операцию:

```txt
agent -> agent_jobs -> app reviews/applies -> local DB -> outbox -> sync
```

Это защищает заметки от неожиданных автоматических правок.

## 14. Visual System: Silicon Nostalgia v2

### Direction

Первоначальная система была слишком близка к монохромному Old Mac. Исправленная версия:

```txt
Old Mac structure
+ Glassmorphism material
+ Web 1.0 links
+ Windows 98 utility controls
+ Y2K chrome highlights
+ restrained industrial accents
```

### Background

Классический 1px dithering остается:

```css
body {
  background-color: #e5e5e5;
  background-image:
    linear-gradient(45deg, #ffffff 25%, transparent 25%),
    linear-gradient(-45deg, #ffffff 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ffffff 75%),
    linear-gradient(-45deg, transparent 75%, #ffffff 75%);
  background-size: 2px 2px;
  background-position: 0 0, 0 1px, 1px -1px, -1px 0;
}
```

### Glass panel

```css
.sn-panel {
  background:
    linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.62),
      rgba(255, 255, 255, 0.34)
    );
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid #000;
  box-shadow:
    4px 4px 0 #000,
    5px 5px 0 rgba(0, 229, 255, 0.42);
}
```

### Active chrome window

```css
.sn-window-active {
  border: 1px solid #000;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.74), rgba(210, 220, 232, 0.44));
  box-shadow:
    4px 4px 0 #000,
    7px 7px 0 rgba(255, 45, 213, 0.28);
}

.sn-titlebar {
  background:
    repeating-linear-gradient(
      0deg,
      rgba(255, 255, 255, 0.85) 0,
      rgba(255, 255, 255, 0.85) 1px,
      rgba(0, 0, 0, 0.12) 1px,
      rgba(0, 0, 0, 0.12) 2px
    );
  border-bottom: 1px solid #000;
}
```

### Palette

Base:

```css
:root {
  --sn-bg: #e5e5e5;
  --sn-ink: #000000;
  --sn-glass: rgba(255, 255, 255, 0.4);
  --sn-link: #0000ee;
}
```

Accents:

```css
:root {
  --sn-electric-blue: #0000ee;
  --sn-cyan: #00e5ff;
  --sn-magenta: #ff2dd5;
  --sn-acid: #b6ff00;
  --sn-amber: #ffc400;
  --sn-industrial: #7f8c99;
}
```

Rules:

- accents are used for state, focus, active window, sync status, locked state;
- no full-screen neon;
- 80-90% of the UI remains glass/gray/black/white;
- color appears as precise signal, not decoration.

### Typography

UI:

```txt
Silkscreen / VT323 / Chicago-like fallback
```

Body/editor:

```txt
Inter / system-ui / SF Pro-like fallback
```

Principle:

- pixel font only for UI chrome, labels and compact controls;
- long-form text stays modern and readable.

### Buttons

```css
.sn-button {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.76), rgba(218, 225, 233, 0.52));
  backdrop-filter: blur(12px);
  border: 1px solid #000;
  box-shadow: 2px 2px 0 #000;
  color: #000;
}

.sn-button:hover {
  background: #000;
  color: #fff;
}

.sn-button:focus-visible {
  outline: 1px solid var(--sn-cyan);
  outline-offset: 2px;
}

.sn-button:active {
  transform: translate(2px, 2px);
  box-shadow: none;
}
```

### Pixel artifacts

Use sparingly:

- hard offset shadows;
- 1px cyan/magenta shadow echoes;
- checkerboard highlights;
- active window chrome;
- bitmap lock/new/sync icons.

Avoid:

- large soft gradient blobs;
- generic purple SaaS gradients;
- overly rounded cards;
- decorative noise that hurts readability.

## 15. MVP user flows

### App open

```txt
1. App shell loads from PWA cache or Tauri bundle.
2. Local DB opens.
3. Notes list renders immediately.
4. Sync status appears in titlebar.
5. Background sync starts if authenticated.
```

### Create note

```txt
1. User presses New note.
2. Client generates UUID.
3. Note is inserted into local DB.
4. note.create operation is added to outbox.
5. UI shows note instantly.
6. Sync sends it to Supabase later.
```

### Edit note

```txt
1. User types.
2. Tiptap JSON updates.
3. Local save debounce writes to SQLite/IndexedDB.
4. note.update operation is queued.
5. Remote sync happens in background.
```

### Lock note

```txt
1. User presses lock icon.
2. App requests master password or active master key.
3. Note document/title/preview are encrypted.
4. Local DB stores only encrypted payload.
5. note.lock operation is queued.
6. Note card shows bitmap lock icon.
```

### Offline writing

```txt
1. Network disappears.
2. User continues writing.
3. Local DB keeps saving.
4. Outbox grows.
5. Sync badge shows offline/queued state.
6. When network returns, sync engine flushes outbox.
```

### Conflict

```txt
1. Same note changed on two devices while offline.
2. Sync detects remote revision mismatch.
3. App marks local note as conflict.
4. App preserves both versions.
5. User can compare and resolve.
```

## 16. Implementation plan

### Stage 1. Foundation

- Create Vite + React + TypeScript app.
- Add Tauri v2 wrapper.
- Add Tailwind CSS and base CSS variables.
- Add vite-plugin-pwa.
- Add platform detection layer.
- Add empty local store interface.

### Stage 2. Local database

- Implement SQLite schema for Tauri.
- Implement Dexie schema for PWA.
- Implement `LocalNotesStore`.
- Implement notes repository.
- Render notes from local DB only.

### Stage 3. Editor

- Add Tiptap.
- Store Tiptap JSON locally.
- Add autosave debounce.
- Add Markdown-like shortcuts.

### Stage 4. Supabase remote

- Add Supabase Auth.
- Add remote migrations:
  - `notes`;
  - `user_crypto`;
  - `devices`;
  - RLS policies;
  - revision trigger.
- Add initial pull/push sync.

### Stage 5. Sync engine

- Implement outbox.
- Implement remote push.
- Implement remote pull by `server_revision`.
- Add Realtime listener.
- Add retry/backoff.
- Add conflict preservation.

### Stage 6. Encryption

- Implement crypto-core:
  - AES-GCM;
  - password KDF;
  - key wrapping;
  - base64 helpers.
- Add crypto profile setup.
- Add lock/unlock note flow.
- Ensure locked plaintext is never persisted locally or remotely.

### Stage 7. Silicon Nostalgia v2 UI

- Add dithering background.
- Add glass panels.
- Add active chrome window frame.
- Add pixel icons.
- Add retro scrollbars.
- Add Y2K accent states.
- Add mobile layout pass.

### Stage 8. Automation readiness

- Add local `automation_events`.
- Add internal event emitter.
- Add JSON contracts for notes/events/jobs.
- Add desktop local API behind a feature flag.
- Add Supabase `automation_events` and `agent_jobs` tables.

### Stage 9. Verification

- Test app opening offline.
- Test editing offline.
- Test sync after reconnect.
- Test conflict preservation.
- Test locked note plaintext absence in Supabase.
- Test locked note plaintext absence in local DB.
- Test Ubuntu Tauri build.
- Test mobile PWA install/open.

## 17. Concrete corrections to the original plan

### Replace

```txt
Next.js App Router + static export
```

with:

```txt
Vite + React + TypeScript
```

### Replace

```txt
Supabase-first CRUD with local cache later
```

with:

```txt
Local DB first, Supabase as background replica
```

### Replace

```txt
client-first + sync-first
```

with:

```txt
local-first + offline-first + sync-replicated
```

### Add immediately

```txt
SQLite for Tauri
IndexedDB/Dexie for PWA
Outbox operations
Sync state cursor
Conflict preservation
Automation events
```

### Visual correction

From:

```txt
Mostly monochrome Old Mac glass
```

To:

```txt
Old Mac structure + glass + Win98 utility controls + Y2K chrome + restrained industrial accents
```

## 18. Recommended MVP scope

Build this first:

- Vite React app;
- Tauri desktop wrapper;
- PWA shell;
- local notes list;
- local Tiptap editor;
- SQLite and IndexedDB adapters;
- outbox;
- Supabase Auth;
- remote notes sync;
- locked note encryption;
- Silicon Nostalgia v2 shell.

Do not build in MVP:

- multi-user collaboration;
- shared workspaces;
- CRDT;
- public publishing;
- complex block database like full Notion;
- AI automation that can mutate notes without user review.

## 19. Source references

Current implementation assumptions were checked against official docs:

- Vite: https://vite.dev/guide/why.html
- Tauri project templates and frontend integration: https://v2.tauri.app/start/create-project/
- Tauri SQL plugin: https://v2.tauri.app/plugin/sql/
- IndexedDB API: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- Dexie React/live queries: https://dexie.org/docs/Tutorial/React
- Vite PWA Plugin: https://vite-pwa-org.netlify.app/
- Supabase Realtime Postgres Changes: https://supabase.com/docs/guides/realtime/postgres-changes
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security

## 20. Final decision

The corrected architecture is:

```txt
Vite + React + TypeScript
+ Tauri v2 for Ubuntu
+ PWA for mobile
+ SQLite on desktop
+ IndexedDB/Dexie on web
+ local-first repository layer
+ durable sync outbox
+ Supabase Auth/Postgres/Realtime/RLS as remote replica
+ Tiptap JSON editor
+ client-side encryption
+ Automation Gateway contracts
+ Silicon Nostalgia v2 visual system
```

Это решение лучше соответствует продукту: оно легче, быстрее, устойчивее к offline-сценариям и заранее оставляет место для локальных скриптов, ИИ-агентов и будущей автоматизации.
