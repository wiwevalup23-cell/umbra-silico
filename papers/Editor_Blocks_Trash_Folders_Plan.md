# План: block-editor база + trash + папки

Дата: 2026-07-15
Статус: рабочий план для кодинг-агента, следующая правка после `UX_review.md`

## Scope — что входит в эту базовую часть

Явно зафиксированный периметр этой правки (согласован с пользователем):

- **Trash** — soft-delete уже есть в Repository, но недостижим из UI. Добавляем UI + restore/purge.
- **Базовые блоки редактора:** to-do, toggle, callout, divider, code-block.
- **Turn-into** — конвертация текущего блока в другой тип.
- **Block-handle** — хэндл у блока: duplicate / delete / move up-down / turn-into.
- **Drag & drop блоков** — перетаскивание блоков внутри документа.
- **Структура папок и подпапок** — вложенное дерево, перемещение заметок между папками.

## Explicitly OUT of scope (следующие модули, не трогать сейчас)

Всё остальное из `UX_review.md`, включая:

- slash-меню (`/`-команды), floating bubble menu на выделении;
- page properties (icon/cover/status/type/date/custom fields);
- database views (table/board/calendar/gallery), filters/sorts/grouping;
- `[[wiki-links]]`, backlinks, relations, knowledge graph;
- templates при создании заметки;
- version history UI, diff/restore, conflict-review UI;
- command palette / quick switcher;
- AI/automation слой поверх Automation Gateway;
- image/file/embed блоки, link preview, synced blocks, block-level comments;
- синхронизация папок в Supabase (см. D.6 — явно отложено внутри этого же документа).

Эти пункты не реализуются в текущей правке даже частично — не добавлять заготовки/заглушки под них, чтобы не плодить недоделанный код.

---

## 0. Инварианты, которые агент обязан соблюдать

Это не формальность — на них стоят зелёные тесты.

1. **Границы слоёв (`src/test/architecture.test.ts`).** Файлы в `src/ui/**/*.tsx` **не должны содержать** подстроки `@/viewmodel`, `@/repository`, `@/sync`, `@/crypto`, `@/local-store`, `@/platform`, `@tauri-apps`, `supabase` — даже в `import type`. Тест грепает сырой текст. Значит:
   - Весь новый UI (кнопки удаления, дерево папок, меню блок-хэндла) получает данные и колбэки **только через props** из композиционного корня `src/app/App.tsx`.
   - Tiptap-расширения (`@tiptap/*`) — **разрешены** в UI. Новые ноды/расширения кладём в `src/ui/editor/extensions/`, они импортируют только `@tiptap/*` и `@/shared/contracts`.
2. **Схема документа менять НЕ нужно.** `documentNodeSchema` в `src/shared/contracts/document.ts` принимает любой `type: string`, а `jsonObjectSchema` допускает boolean/number. Новые блоки (`taskList/taskItem`, `details*`, `callout`, `horizontalRule`, `codeBlock`) валидируются как есть. `schemaVersion` остаётся `1` — новые ноды аддитивны и обратно совместимы.
3. **Крипто и sync для блоков не трогаем.** Любой блок — это часть Tiptap JSON, который уходит обычным `note.update`. Заблокированные заметки шифруют весь документ целиком → новые блоки проходят прозрачно.
4. **Каждая фаза — отдельный PR/модуль.** Порядок: A (trash) → B (блоки) → C (block-handle+DnD) → D (папки). B до C, потому что меню «turn into» в хэндле ссылается на новые типы блоков.
5. **Тест-гейты после каждой фазы:** `npm run build`, `npm test`, плюс новые тесты фазы. Contract-тест локального стора (`local-notes-store.contract.test.ts`) должен покрывать и Dexie, и SQLite для любых новых методов стора.

---

## Фаза A — Trash (корзина)

**Почему первой:** удаления в UI сейчас нет вообще, хотя `deleteNote` уже делает soft-delete (`deletedAt`, op `note.delete`) — см. `src/repository/note-repository.ts:263`. Это самый дешёвый видимый выигрыш и он самодостаточен.

### A.1 Local store
- `src/local-store/contracts/local-notes-store.ts`: добавить в интерфейс
  - `listDeletedNotes(): Promise<NoteListItem[]>`
  - `hardDeleteNote(id: NoteId): Promise<void>`
- Dexie (`src/local-store/dexie/dexie-notes-store.ts`): `listDeletedNotes` = как `listNotes`, но `.filter(row => row.deletedAt !== null)`; `hardDeleteNote` = `this.db.notes.delete(id)`.
- SQLite (`src/local-store/sqlite/sqlite-notes-store.ts`): `listDeletedNotes` = `select ... where deleted_at is not null order by deleted_at desc`; `hardDeleteNote` = `delete from notes where id = ?`.

### A.2 Repository
`src/repository/note-repository.ts` + контракт `src/repository/contracts/note-repository.ts`:
- `liveTrashList(): LiveQuery<NoteListItem[]>` — по аналогии с `liveNoteList`, источник `localStore.listDeletedNotes()`.
- `restoreNote(noteId)`: взять заметку, `deletedAt = null`, `syncStatus='dirty'`, `localRevision+1`, новый `opId`, оп типа **`note.update`** (переиспользуем — `mapLocalNoteToSyncPayload` уже кладёт `deletedAt`, так что remote-upsert увидит `null` и «воскресит»). `putNoteWithOp` + `refreshLiveQueries` + automation-event `note.updated`.
- `purgeNote(noteId)`: `localStore.hardDeleteNote(noteId)`, без нового op (remote уже держит tombstone от первого delete), `unlockedSessions.delete`, `refreshLiveQueries`. В комментарии зафиксировать: purge — локальная чистка, remote сохраняет tombstone.
- `deleteNote` уже есть, ничего не меняем.

### A.3 ViewModel
- Новый `src/viewmodel/trash-view-model.ts` → `useTrashViewModel()` возвращает `{ trashedNotes, restoreNote, purgeNote }` (по образцу `notes-view-model.ts`, через `useLiveQuery(repository.liveTrashList())`, с `syncEngine?.requestSync('outbox-change')`).
- В `useNotesViewModel` уже есть `deleteNote` — просто прокинуть его в UI.

### A.4 UI (props-only, без нарушения границ)
- `src/ui/components/notes/NoteCard.tsx`: добавить необязательный `onDelete?: (id) => void`; при наличии — hover-кнопка с `UiIcon name="trash"` (иконка уже есть в наборе). Событие не должно триггерить `onSelect` (`stopPropagation`).
- `src/ui/components/notes/NoteList.tsx`: прокинуть `onDeleteNote`; добавить в заголовок/футер пункт **Trash** со счётчиком.
- Новый `src/ui/components/notes/TrashView.tsx`: список удалённых (title/preview/дата удаления) + на каждой строке **Restore** и **Delete forever**. Для «Delete forever» — подтверждение (переиспользовать паттерн модалки; можно `window.confirm` на первом шаге, отметить TODO на брендированную модалку).
- `src/app/App.tsx`: состояние `libraryMode: 'notes' | 'trash'`; в режиме trash в левой панели рендерить `TrashView` с данными из `useTrashViewModel`. Кнопку delete на карточке связать с `notesViewModel.deleteNote`.

### A.5 Тесты / DoD
- Repository-тест (`src/test/note-repository.test.ts`): delete → появляется в trash и исчезает из основного списка; restore → возвращается; purge → исчезает отовсюду и `getNote` = null.
- Contract-тест стора: `listDeletedNotes`/`hardDeleteNote` на обоих адаптерах.
- **DoD:** заметку можно удалить из списка, увидеть в Trash, восстановить и удалить навсегда; оба store-адаптера проходят общий contract-suite.

---

## Фаза B — Базовые блоки + turn-into

Блоки: **divider, code-block, to-do, toggle, callout**. `divider` (`horizontalRule`) и `codeBlock` уже в StarterKit — их надо только «вывести наружу». Остальное — расширения/нода.

### B.1 Пакеты
```
@tiptap/extension-task-list @tiptap/extension-task-item
@tiptap/extension-details @tiptap/extension-details-summary @tiptap/extension-details-content
```
(версии выровнять по `^3.27`). Drag-handle — в фазе C.

### B.2 Расширения (кладём в `src/ui/editor/extensions/`)
- **To-do:** `TaskList` + `TaskItem.configure({ nested: true })`. Атрибут `checked: boolean` — валиден (`jsonObjectSchema` допускает boolean). Input-rule `[] ` идёт из коробки.
- **Toggle:** `Details` + `DetailsSummary` + `DetailsContent`. Стрелку сворачивания сделать через CSS (`::before` на summary) или лёгкий NodeView. Не забыть, что `details` требует все три ноды.
- **Callout:** официальной ноды нет → **кастомная нода** `src/ui/editor/extensions/callout.ts`:
  - `group: 'block'`, `content: 'block+'`, `defining: true`;
  - `attrs`: `{ tone: 'info'|'warn'|'success'|'neutral' (default 'info'), emoji: string (default '💡') }`;
  - `parseHTML`/`renderHTML`: `div[data-callout]` с `data-tone`;
  - команды `setCallout(attrs)` / `toggleCallout()` (через `wrapIn`/`setNode` + `toggleWrap`);
  - без слэш-меню вставка идёт из «+»-меню хэндла (фаза C) и опц. input-rule (`>> ` например).
- **Divider/CodeBlock:** уже в StarterKit — не регистрировать повторно (иначе duplicate-extension warning). Просто добавить команды в тулбар/меню.

Все расширения регистрируются в массиве `extensions` внутри `useEditor` в `src/ui/components/notes/EditorShell.tsx` (~строка 1104), рядом с `BlockLayout`, `PageLayout`.

### B.3 Turn-into
Функция-хелпер `turnInto(editor, target)` где target ∈ `paragraph | heading1..3 | bulletList | orderedList | taskList | blockquote | codeBlock | callout | toggle`. Реализация — `editor.chain().focus().<command>().run()` (`setParagraph`, `toggleHeading`, `toggleBulletList`, `toggleTaskList`, `setCodeBlock`, `toggleBlockquote`, `setCallout`, `setDetails`). Пока используется из меню блок-хэндла (фаза C) и из «More»-меню тулбара как временный доступ.

### B.4 UI/CSS
- В `src/ui/styles/silicon-nostalgia.css` — стили `data-callout[data-tone]`, `ul[data-type="taskList"]`, чекбоксы, `details`/`summary`, `hr`, `pre code`. Держать в стиле Silicon Nostalgia (glass/pixel), **не добавлять новые `!important`** (в файле их уже 111 — не усугублять; см. `UX_review.md`).
- Тулбар `EditorToolbar` в `EditorShell.tsx`: в «More»-меню добавить кнопки Divider / Code / To-do / Toggle / Callout как временную точку входа (полноценный `/`-menu — отдельной правкой позже, вне scope).

### B.5 Тесты / DoD
- `src/test/editor-blocks.test.ts`: собрать `Editor` headless (как в `editor-autosave.test.ts`); для каждого блока — вставить, получить `getJSON()`, прогнать через `parseNoteDocument()` → **валидно**; toggle checked у taskItem сохраняется.
- **DoD:** все пять блоков создаются, сохраняются (autosave), переживают перезагрузку, `turnInto` конвертирует текущий блок; документ проходит Zod-валидацию; заблокированная заметка с новыми блоками шифруется/расшифровывается без потерь.

---

## Фаза C — Block-handle + drag & drop

**Зависит от B** (меню хэндла предлагает turn-into в новые блоки).

### C.1 Пакет
```
@tiptap/extension-drag-handle-react
```
> В Tiptap v3 drag-handle открыт (ранее Pro). Агент должен проверить доступность версии `^3.27`; фолбэк — community `tiptap-extension-global-drag-handle` + ручной `<DragHandle>`.

### C.2 Реализация
- Новый `src/ui/components/notes/BlockHandle.tsx`: рендерит `<DragHandle editor={editor}>` **рядом** с `<EditorContent>` в `EditableNoteEditor` (`EditorShell.tsx`, внутри `.sn-page-layout-frame`). Хэндл автопозиционируется у наведённого блока; drag-to-reorder работает из коробки.
- В хэндле два affordance:
  - **«+»** — вставить пустой блок ниже (`insertContentAt`), опц. открыть меню типов (paragraph/heading/todo/toggle/callout/divider/code).
  - **«⋮⋮»** — контекстное меню блока: **Turn into ▸** (из B.3), **Duplicate**, **Delete**, **Move up/Move down**.
  - Реализация действий через позицию текущей ноды: получить `editor.state.selection` / `$from`, вычислить диапазон ноды, применить транзакцию (`deleteRange`, `insertContentAt`, для move — вырезать+вставить).
- Меню — свой popover (паттерн «More menu» с закрытием по `pointerdown`/`Escape` уже есть в `EditorShell.tsx` ~строка 533).

### C.3 CSS/поведение
- Хэндл виден при hover строки, скрыт иначе; на мобилке — не мешает (можно прятать под `@media`). Учесть, что курсор не должен прыгать при вставке.
- Проверить, что `onUpdate` автосейва срабатывает после DnD/duplicate/delete (реордер = транзакция → `onUpdate` вызовется, autosave запланируется).

### C.4 Тесты / DoD
- `src/test/block-handle.test.ts` (headless editor): duplicate добавляет копию ноды; delete удаляет; move меняет порядок в `getJSON()`; результат валиден.
- **DoD:** у каждого блока есть хэндл; блоки перетаскиваются мышью; меню даёт turn-into/duplicate/delete/move; изменения автосохраняются.

---

## Фаза D — Папки и подпапки

Самая тяжёлая: затрагивает contracts → local-store (Dexie + SQLite миграции) → repository → viewmodel → UI-дерево. Рекомендуемая модель: **отдельная сущность `folder`** (даёт rename и пустые папки) + **`parentFolderId: string | null` на заметке**.

> **Scope-решение:** папки — **local-first**. Связь заметка→папка (`parentFolderId`) едет в payload `note.update` и синхронизируется сразу. **Синхронизация самих folder-сущностей в Supabase — отдельный под-этап D.6, который можно отложить**: до него папки живут локально, а на другом устройстве заметка с неизвестным `parentFolderId` показывается в корне (orphan). Это осознанный компромисс MVP.

### D.1 Shared contracts
- Новый `src/shared/contracts/folder.ts`:
  - `folderIdSchema` (branded), `FolderId`.
  - `LocalFolder = { id, userId, name, parentFolderId: FolderId|null, sortIndex: number, createdAt, updatedAt, deletedAt: string|null, localRevision, syncStatus, deviceId }`.
  - `FolderTreeNode` (для UI: `{ folder, children, noteCount }`).
  - Валидация против циклов (папка не может быть предком самой себя) — pure-функция `wouldCreateCycle(folders, childId, newParentId)`.
- `src/shared/contracts/note.ts`: добавить `parentFolderId: folderIdSchema.nullable()` в `localNoteBaseSchema` (default `null`), в `createDraftLocalNote`, в `createNoteInputSchema` и `updateNotePatchSchema` (`parentFolderId?`).
- `src/shared/contracts/sync.ts`: расширить `syncOperationTypeValues` → добавить `folder.create`, `folder.update`, `folder.delete` (для D.6; на этапе D.1–D.5 они объявлены, но не отправляются в Supabase).
- Экспортировать всё через `src/shared/contracts/index.ts`.

### D.2 Local store
- Ряды `src/local-store/contracts/local-records.ts`: в `StoredNoteRow` добавить `parentFolderId: string | null`; новый `StoredFolderRow`.
- `src/local-store/serialization.ts`: маппинг нового поля туда-обратно.
- Dexie (`src/local-store/dexie/dexie-db.ts`): **`db.version(2)`** — добавить таблицу `folders: 'id, userId, parentFolderId, deletedAt, updatedAt'` и индекс `parentFolderId` в `notes`. Добавление nullable-поля в записи миграции не требует (IndexedDB schemaless), но новый индекс требует bump версии.
- SQLite (`src/local-store/sqlite/sqlite-schema.sql`): **идемпотентная миграция** — `create table if not exists folders (...)` + `alter table notes add column parent_folder_id text` (обернуть в проверку `pragma table_info(notes)` или отдельный migrations-runner, т.к. схема прогоняется при старте; `ADD COLUMN` не идемпотентен). Агент должен проверить, как запускается схема в `src/local-store/sqlite/sqlite-driver.ts`, и добавить versioned-миграцию.
- Методы стора: `listFolders()`, `putFolder(folder)`, `softDeleteFolder(id)` (+ решить судьбу вложенных: каскад в корень или каскад-в-trash — для MVP: при удалении папки её заметки и подпапки поднять в родителя).

### D.3 Repository
- Контракт + реализация: `liveFolderTree()`, `createFolder({name, parentFolderId})`, `renameFolder`, `moveFolder(id, newParentId)` (с проверкой `wouldCreateCycle`), `deleteFolder(id)`, `moveNoteToFolder(noteId, folderId|null)` (= `updateNote` с `parentFolderId`).
- `liveNoteList` расширить фильтром `folderId?: FolderId | null` (в `note.ts` `noteListQuerySchema`), чтобы список показывал заметки выбранной папки.

### D.4 ViewModel
- `src/viewmodel/folders-view-model.ts` → `useFoldersViewModel()` → `{ folderTree, activeFolderId, selectFolder, createFolder, renameFolder, moveFolder, deleteFolder, moveNoteToFolder }`. Активная папка — UI-state в `src/viewmodel/app-ui-store.ts`.

### D.5 UI (props-only)
- Новый `src/ui/components/notes/FolderTree.tsx`: рекурсивное дерево (раскрытие/сворачивание, счётчик заметок, «New subfolder», rename inline, контекст-меню). Данные и колбэки — из props.
- Встроить в левую панель `src/app/App.tsx` над/вместо плоского списка: сверху дерево папок, ниже — заметки активной папки (`notesViewModel` с `folderId`).
- **Drag&drop заметки в папку:** карточка заметки — draggable, узел дерева — drop-target → `moveNoteToFolder`. (Переиспользовать HTML5 DnD; не путать с Tiptap-DnD блоков из фазы C.)
- Trash из фазы A: при удалении папки её содержимое всплывает в родителя (см. D.2).

### D.6 (Опционально/отложенно) Sync папок в Supabase
- Remote-миграция `supabase/migrations/*`: таблица `folders` (id, user_id, name, parent_folder_id, sort_index, revision-trigger, RLS «Users manage own folders» по образцу `notes` из `Silicon_Nostalgia_App_Spec.md`), колонка `parent_folder_id` в `notes`.
- Remote gateway (`src/sync/supabase/supabase-remote-gateway.ts`) + push/pull: обработать `folder.*` ops.
- До этого этапа `folder.*` ops не отправляются (или складываются, но push их скипает) — пометить явным TODO. **Не часть DoD текущей правки.**

### D.7 Тесты / DoD
- Repository-тесты: создать дерево, переместить заметку, запретить цикл (`moveFolder` в потомка → ошибка), удалить папку → содержимое всплывает.
- Contract-тест стора: folder-методы на Dexie и SQLite; Dexie v1→v2 миграция открывается без потери заметок.
- **DoD (без D.6):** можно создавать вложенные папки, переименовывать, перетаскивать заметки в папки, видеть заметки выбранной папки; всё сохраняется локально и переживает перезапуск; циклы невозможны.

---

## Сводка пакетов к установке
```
# Фаза B
@tiptap/extension-task-list @tiptap/extension-task-item
@tiptap/extension-details @tiptap/extension-details-summary @tiptap/extension-details-content
# Фаза C
@tiptap/extension-drag-handle-react
```
Divider (`horizontalRule`) и code-block уже в `@tiptap/starter-kit` — новых пакетов не требуют.

## Глобальный Definition of Done (для всей базовой части)
- `npm run build` и `npm test` зелёные; `architecture.test.ts` не нарушен (в `src/ui/**` нет запрещённых импортов).
- Новые store-методы покрыты общим contract-suite (Dexie + SQLite).
- Документы со всеми новыми блоками проходят `parseNoteDocument()` и корректно шифруются/расшифровываются.
- `schemaVersion` не менялся; миграции БД идемпотентны и не теряют данные.
- Trash, блоки (to-do/toggle/callout/divider/code-block), turn-into, block-handle с drag&drop, папки и подпапки — все работают end-to-end через UI, а не только на уровне Repository.
