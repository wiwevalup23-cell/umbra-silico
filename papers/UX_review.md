# UX Review: Umbra Silico

Дата аудита: 2026-07-15  
Область: текущее React/Vite приложение в `apps/app`

## Короткий вердикт

На desktop приложение уже выглядит как сильный local-first редактор заметок с выразительной оболочкой Silicon Nostalgia: есть библиотека, редактор, инспектор, autosave, sync-state, lock/unlock и хорошая техническая база. Но как полноценный Notion-подобный инструмент, который сам подстраивается под нужды пользователя, оно пока не собрано: нет настоящего block editor UX, баз данных, свойств, views, relations, templates, истории версий и адаптивных workflow.

Главная практическая проблема прямо сейчас: mobile UX критически сломан. На узкой ширине бренд обрезается, workspace переполняет экран, редактор превращается в слишком узкую колонку, а уже написанный `MobileTabBar` фактически не подключен.

## Что реализовано хорошо

### Техническое ядро

- Local-first архитектура уже есть: Dexie/IndexedDB для PWA, SQLite/Tauri для desktop, Repository слой, LiveQuery, outbox operations, sync engine, Supabase как удаленная реплика.
- CRUD заметок реализован на уровне Repository.
- Autosave реализован через debounced сохранение заголовка и документа.
- Есть lock/unlock модель с шифрованием заметки и временной unlocked-session.
- Есть тестовая база вокруг контрактов, ViewModel, Repository, sync, PWA/desktop readiness.

### Основной shell приложения

- Есть трехпанельный workspace: `Library`, `Editor`, `Details`.
- Панели можно сворачивать; есть focus layout.
- Topbar содержит основные действия: create, lock, refresh sync, focus, settings.
- В библиотеке есть поиск, счетчик заметок, sync status, карточки заметок с датой, preview, lock/sync state.
- Пустое состояние визуально сильное: branded player, `hello`, “Ready to record”.

### Редактор

- Редактор построен на Tiptap.
- Есть базовое форматирование: bold, italic, strike, inline code.
- Есть структура документа: H1/H2, quote, bullet list, ordered list.
- Есть undo/redo.
- Есть таблицы через Tiptap TableKit: insert table, add row/column, header row, delete table.
- Есть кастомные настройки block layout: indent, margin.
- Есть page layout handles: header/footer offset.
- Есть локальный статус сохранения: `Saved`, `Saving`, `Unsaved`, `Review`.

### Инспектор

- Есть вкладки `Details`, `Links`, `Versions`.
- Details показывает folder, updated, state, privacy.
- Tags извлекаются из текста через `#tag`.
- Links пытается находить связанные заметки по совпадению заголовков.
- Versions показывает local/remote revision, created, modified.

### Настройки

- Есть modal settings.
- Есть настройка UI scale.
- Есть выбор background image.
- Settings сохраняются в `localStorage`.

## Что реализовано плохо

### Mobile UX

Это самый важный UX-блок на исправление.

На viewport около 390px:

- бренд `Umbra Silico` обрезается;
- topbar не умеет нормально ужиматься;
- workspace создает горизонтальное/вертикальное переполнение;
- empty player становится непригодным для использования;
- активный редактор сжимает контент так, что текст идет почти по буквам вертикально;
- пользователь видит rails, но не получает полноценной мобильной навигации.

Причина, по коду: в конце `silicon-nostalgia.css` есть большой блок “Scale & Spacing surgical overrides” с `!important`, который масштабирует desktop UI под ощущение 125% browser zoom и перебивает mobile media rules. Это ломает адаптив.

Дополнительно: компонент `MobileTabBar` существует, но не используется в `AppWorkspace`.

### Toolbar редактора

Toolbar сейчас скорее инженерный, чем пользовательский:

- `Tbl`, `C+`, `R+`, `Hd`, `Del`, `H-`, `H+`, `F-`, `F+`, `M+` требуют расшифровки.
- Важные команды спрятаны в settings-like меню.
- Нет привычного block editor поведения: `/` menu, block handle, контекстные команды рядом с текущим блоком.
- Header/footer controls выглядят как часть основного writing UX, хотя это скорее print/page layout режим.

### Empty state

Пустое состояние красивое и брендированное, но действие создания заметки спрятано в invisible hotspot на кнопке play. Это атмосферно, но плохо для ежедневного инструмента. Нужна явная команда рядом:

- create blank note;
- create from template;
- import;
- open recent.

### Инспектор обещает больше, чем делает

`Links`, `Tags`, `Versions` выглядят как полноценные продуктовые функции, но пока это только легкие эвристики:

- теги не являются свойствами заметки;
- links ищутся по совпадению заголовков в тексте, а не через настоящий граф ссылок;
- versions не дают diff/restore/history;
- нет backlinks;
- нет outline;
- нет свойств страницы.

### CRUD есть не полностью в UI

`deleteNote` реализован во ViewModel и Repository, но в пользовательском интерфейсе нет нормального действия удаления, архива или trash.

### Loading/error state

При bootstrap локального store пользователь видит простой текст `Loading local store...`. Для продукта с такой сильной визуальной оболочкой это выглядит как незавершенная техническая заглушка. Нужен branded loading shell и понятное состояние ошибки local store.

### Settings неполные

В settings state есть `sidebarWidth` и `inspectorWidth`, они применяются как CSS variables, но в UI settings нет контролов для этих параметров.

## Что не реализовано вообще

### Структура workspace

- Нет spaces/workspaces.
- Нет sidebar tree.
- Нет nested pages/subpages.
- Нет favorites.
- Нет recent pages.
- Нет archive/trash.
- Нет quick switcher.

### Настоящий block editor

Нет:

- `/` command menu;
- block handle;
- drag-and-drop блоков;
- duplicate/delete/move block;
- turn into;
- to-do block;
- toggle block;
- callout;
- divider;
- code block;
- image/file/embed blocks;
- link preview/embed;
- synced blocks;
- block-level comments.

### Базы данных

Нет:

- database/page collection model;
- properties;
- table view;
- board view;
- calendar view;
- timeline view;
- gallery view;
- list view как view, а не просто список заметок;
- filters;
- sorts;
- grouping;
- formulas;
- rollups;
- relations.

### Связи и knowledge graph

Нет:

- явных page links;
- backlinks;
- linked mentions;
- graph model;
- relation properties;
- block links;
- aliases;
- unresolved links.

### Templates

Нет:

- page templates;
- database templates;
- template picker при создании;
- suggested templates;
- пользовательских шаблонов;
- шаблонов под повторяющиеся задачи.

### История и восстановление

Нет:

- version history UI;
- diff между версиями;
- restore version;
- trash;
- undo delete;
- conflict resolution UI.

### Адаптивность под пользователя

Нет слоя, который изучает поведение пользователя и предлагает:

- свойства для заметок;
- теги;
- relations;
- views;
- шаблоны;
- структуру workspace;
- автоматизации;
- summary/outline;
- follow-up tasks;
- reorganize suggestions.

## Какие функции Notion стоит реализовать

Ниже не список для копирования Notion целиком, а приоритетное ядро, которое превратит Umbra Silico из красивой записной книжки в полноценный инструмент.

### 1. Slash menu

Главный скачок в UX редактора.

Команды:

- Text;
- Heading 1/2/3;
- Bulleted list;
- Numbered list;
- To-do;
- Toggle;
- Quote;
- Callout;
- Divider;
- Code block;
- Table;
- Link page;
- New subpage;
- Template;
- AI action.

Почему важно: пользователь не должен искать команды в toolbar. Он должен писать и вызывать нужный блок там, где находится курсор.

### 2. Block handle

У каждого блока должен быть handle:

- drag;
- move up/down;
- duplicate;
- delete;
- turn into;
- copy link to block.

Это основа ощущения “документ собирается из живых деталей”.

### 3. Page properties

Каждая заметка должна стать page object:

- title;
- icon;
- cover optional;
- tags;
- status;
- type;
- date;
- priority;
- related pages;
- custom properties.

Свойства лучше показывать в правом инспекторе и в database views.

### 4. Database views

На базе текущих notes можно построить collection model:

- list;
- table;
- board;
- calendar;
- gallery;
- timeline позже.

Минимально полезный набор:

- properties;
- filters;
- sorts;
- grouping;
- saved views.

Это позволит приложению подстраиваться под задачи: для дневника list, для задач board/calendar, для research table/gallery.

### 5. Relations и backlinks

Текущий `Links` по совпадению заголовков заменить на настоящий graph:

- `[[Page]]` link;
- backlinks;
- related pages property;
- unresolved links;
- link suggestions.

### 6. Templates

Нужны шаблоны:

- blank note;
- daily note;
- meeting;
- research note;
- task/project;
- reading note;
- person/contact;
- custom user template.

Создание заметки должно предлагать шаблон, а не только `Untitled`.

### 7. Version history и trash

Обязательно для доверия:

- история изменений;
- diff;
- restore;
- archive/trash;
- undo delete;
- conflict review.

### 8. Command palette / quick switcher

Глобальная команда:

- открыть заметку;
- создать страницу;
- найти блок;
- переключить view;
- выполнить action;
- перейти в settings.

### 9. AI/automation слой

Не “чат сбоку”, а quietly useful assistant:

- предложить теги;
- предложить свойства;
- создать view из текущих заметок;
- извлечь задачи;
- сделать summary;
- найти связанные заметки;
- предложить template;
- превратить хаотичный набор заметок в структуру.

## Как лучше организовать редактор

### Базовая модель

Редактор лучше разделить не на разные приложения, а на три режима одной страницы:

1. `Write`
2. `Organize`
3. `View`

### Write mode

Цель: писать без трения.

Интерфейс:

- центральный document canvas;
- slash menu;
- floating bubble menu для выделенного текста;
- block handle слева от блока;
- минимальный top toolbar или вообще без него;
- autosave badge;
- properties collapsed.

Что убрать из основного writing режима:

- header/footer handles;
- page layout menu;
- слишком много table controls в общем toolbar.

Page layout лучше вынести в отдельный `Print/Page` режим.

### Organize mode

Цель: привести страницу в систему.

Правый inspector должен стать рабочей панелью:

- properties;
- tags;
- backlinks;
- related pages;
- outline;
- tasks extracted from page;
- version history;
- AI suggestions.

### View mode

Цель: смотреть на те же данные как на базу.

Views:

- list;
- table;
- board;
- calendar;
- gallery.

Это должно работать поверх одной коллекции pages, а не быть отдельными сущностями.

## Рекомендуемая структура экрана

### Desktop

Слева: `Navigator`

- Spaces;
- Pages tree;
- Databases;
- Favorites;
- Recent;
- Trash.

Центр: `Canvas`

- page title;
- properties summary;
- block editor;
- slash menu;
- block handles.

Справа: `Context`

- properties;
- outline;
- backlinks;
- versions;
- automation/AI suggestions.

### Mobile

Только один слой за раз:

- `Library`;
- `Editor`;
- `Details`.

Использовать уже созданный `MobileTabBar`, но подключить его к `AppWorkspace`.

На mobile:

- убрать desktop rails как основной паттерн;
- сделать topbar компактным;
- editor canvas должен занимать всю ширину;
- toolbar должен быть bottom/floating или slash-first;
- inspector открывать отдельным экраном/листом.

## Приоритетный план работ

### P0: починить mobile

- Убрать или ограничить desktop-only `!important` scale overrides.
- Подключить `MobileTabBar`.
- Сделать mobile layout одноэкранным.
- Починить topbar wrapping.
- Проверить 390px, 430px, tablet, desktop screenshots.

### P1: сделать редактор block-first

- Slash menu.
- Block handle.
- Floating text bubble menu.
- Контекстные block commands.
- Убрать непонятные toolbar labels.

### P2: page properties и нормальный inspector

- Добавить properties model.
- Tags сделать свойством, а не regex-only.
- Добавить outline.
- Добавить backlinks model.

### P3: database views

- Table/list views.
- Filters/sorts.
- Board by status.
- Saved views.

### P4: templates и adaptive layer

- Template picker при создании.
- User templates.
- Suggested templates based on content.
- Auto-properties/tags/relations.

### P5: history, trash, conflict UX

- Trash/archive.
- Version history.
- Restore.
- Conflict review UI.

## Итог

Umbra Silico уже имеет характер и серьезный local-first фундамент. Самое ценное в текущем продукте - не ретро-стилизация сама по себе, а сочетание надежного локального редактора, приватности и выразительной оболочки. Но следующий этап должен сместить фокус с “красивого окна для заметки” на “живую систему блоков, свойств, связей и views”.

Если кратко: сначала чинить mobile, затем превращать редактор из toolbar-first в slash/block-first, затем строить page properties и database views.
