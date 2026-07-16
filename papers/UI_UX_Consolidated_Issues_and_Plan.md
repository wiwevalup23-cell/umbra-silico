# Umbra Silico: единый UI/UX-аудит и план исправлений

Дата: 2026-07-16

Область: `apps/app`

Статус: P0, P1 и P2 реализованы и проверены

## Цель

Довести существующий интерфейс Umbra Silico до устойчивой первой версии без
расширения продуктового scope. Мы не добавляем новые крупные подсистемы и не
превращаем приложение в универсальный workspace. Работа посвящена доверию к
данным, адаптивности, ясности сценариев и визуальной цельности уже реализованных
функций.

Документ объединяет:

- визуальное тестирование на ширинах 320, 390, 768, 820, 821, 1024, 1120,
  1121, 1280 и 1440 px;
- desktop и mobile-сценарии создания, редактирования, поиска, шаблонов,
  свойств, папок, корзины, настроек и блокировки;
- замечания с локальных референсов `troubles/1.png` — `troubles/7.png`;
- ранее найденные проблемы визуальной системы и доступности.

## Неподвижные принципы

1. Редактор — главная рабочая зона. Остальной chrome уступает ему место.
2. Local-first состояние должно объясняться одним непротиворечивым языком.
3. Незашифрованная заметка не должна выглядеть зашифрованной.
4. На touch-устройстве нет невидимых действий и hover-only сценариев.
5. Новые диалоги используют визуальную грамматику удачного окна блокировки:
   полосатый titlebar, тёплая бумажная поверхность, bevel-контролы, ясная
   пиктограмма и выраженная основная кнопка.
6. Браузерные `window.prompt` и `window.confirm` в пользовательских сценариях
   не используются.
7. Декоративность не должна ухудшать чтение, геометрию или понимание состояния.
8. Новая функциональность вне текущего UX scope в эту работу не входит.

## Эталон окон приложения

Экран блокировки заметки принимается за визуальный эталон, но его текущая
логика и доступность также будут исправлены. На его основе нужен переиспользуемый
каркас `RetroDialogShell`:

- нативный `<dialog>` и настоящий focus trap;
- полосы и заголовок из lock-window;
- единые размеры заголовка, иконки, тела и footer;
- варианты `default`, `danger` и `secure`;
- закрытие по `Escape`, backdrop и явной кнопке с видимым крестиком;
- возврат фокуса в элемент, открывший окно;
- мобильная геометрия без выхода за `visualViewport`;
- уважение `prefers-reduced-motion`.

Из этого каркаса строятся:

- `ConfirmDialog` для окончательного удаления заметки и удаления папки;
- `PromptDialog` для создания и переименования папки;
- улучшенное окно lock/unlock;
- компактный `StatusPicker` в той же визуальной системе, но как popover, а не
  тяжёлое полноэкранное окно.

## Единый реестр проблем

### P0 — доверие, потеря данных и сломанная геометрия

Статус на 2026-07-16: `UX-001`–`UX-010` закрыты в коде.

- note actions больше не имеют невидимой кликабельной destructive-зоны;
- mobile tabs включаются до 959 px, compact desktop работает на 960–1279 px,
  full desktop — от 1280 px;
- Inspector на compact desktop открывается overlay и не меняет ширину редактора;
- небезопасная настройка `body zoom` удалена;
- local save, remote sync и encryption получили раздельные и единые состояния;
- lock требует повтор пароля, поддерживает reveal и корректное управление фокусом;
- permanent delete использует `ConfirmationDialog` на общем
  `RetroDialogShell`, с безопасным начальным действием Cancel.

Проверено автоматическими тестами и визуальным smoke test на 959×900,
960×900 и 1280×900. На 960 px ширина editor до и после открытия Inspector
остаётся 468 px; Inspector открывается справа overlay шириной 344 px.

| ID | Проблема | Что делаем |
| --- | --- | --- |
| UX-001 | На mobile кнопка удаления заметки имеет `opacity: 0`, но остаётся кликабельной. Возможна случайная отправка заметки в корзину. | Убираем интерактивность у скрытого действия. На touch показываем явное контекстное меню или swipe/action sheet с подписью. Перемещение в корзину остаётся обратимым. |
| UX-002 | Переход 820 → 821 px резко меняет mobile на тесный desktop; плеер и текст обрезаются. | Переносим tablet/tab-layout выше либо вводим compact desktop. Решение принимается по фактической ширине редактора, а не только viewport. |
| UX-003 | Переход 1120 → 1121 px раскрывает Inspector и снова сжимает редактор до нерабочего состояния. | Полный Inspector разрешаем только когда центральная колонка сохраняет безопасную ширину. До этого используем rail или overlay. |
| UX-004 | UI scale 115% через `body.style.zoom` делает приложение выше viewport; нижние элементы и Trash пропадают, tab bar перекрывает контент. | Удаляем масштабирование `body`. Масштабируем типографику и spacing через корневой коэффициент/rem либо временно убираем настройку до безопасной реализации. |
| UX-005 | Обычная незашифрованная заметка показывает замок и `PRIVATE`, рядом остаётся действие `Lock note`. | Разделяем «локальная приватность» и «зашифровано». Для обычной заметки используем shield/local-only, замок — только для реально locked note. |
| UX-006 | Одна заметка одновременно показывает зелёный `Saved locally`, янтарный `dirty` и облако `SAVED`. | Вводим одну пользовательскую state machine и единые текст, цвет и иконку во всех местах. Технический `dirty` не показываем как предупреждение при отсутствии remote. |
| UX-007 | Кнопка Refresh sync активна в local-only режиме и не даёт понятной обратной связи. | Скрываем её без remote либо показываем disabled-состояние с ясным объяснением. Облако не используется как знак обычного локального сохранения. |
| UX-008 | Необратимая блокировка принимает пароль один раз; нет подтверждения и reveal-toggle. Ошибка ввода может навсегда закрыть данные. | В режиме lock добавляем повтор пароля, reveal-toggle, проверку совпадения и ясное необратимое предупреждение. Unlock оставляем с одним полем. |
| UX-009 | В lock-dialog начальный фокус фактически попадает на Close, а верхняя кнопка выглядит пустым квадратом. | Фокусируем password input после `showModal`, рисуем настоящий крестик, возвращаем фокус после закрытия. |
| UX-010 | Окончательное удаление использует системный browser confirm (`troubles/4.png`). Он выбивается из приложения и показывает технический адрес. | Заменяем на `ConfirmDialog` в стиле lock-window. В тексте называем заметку, подчёркиваем необратимость; primary action — Restore/Cancel, danger action — Delete forever. |

### P1 — ключевые рабочие сценарии

P1 поставляется двумя самостоятельными частями:

- **P1-A (`UX-011`–`UX-023`)** — плеер и фоны, Properties/Inspector,
  контекст папки, empty editor и основные mobile editor actions;
- **P1-B (`UX-024`–`UX-035`)** — More menu surface, Quick switcher,
  доступность остальных dialog, mobile navigation и folder workflows.

Такое разделение не смешивает геометрию редактора с навигацией и заменой
оставшихся системных окон.

Статус на 2026-07-16: **P1-A (`UX-011`–`UX-023`) реализован**.

- player copy выровнен как единая container-aware группа и не обрезается в
  compact desktop;
- backgrounds получили различимые preview, осмысленные имена и честный scope
  `Empty screen background`;
- Properties собраны по одной сетке, native status select заменён доступным
  `StatusPicker`, а header Details больше не сталкивает линии со статусом;
- `Root` заменён на `All notes`, active folder усилен, его имя отражается в
  заголовке Library;
- пустой mobile editor показывает placeholder и получает initial caret при
  создании заметки;
- mobile toolbar оставляет частые действия в одной строке, вторичные действия
  находятся в More, а block actions доступны через явную 44 px кнопку;
- из More удалены произвольные margins, indent-сокращения и page pixel offsets;
  оставшиеся команды получили полные названия.

Визуально проверены 390×844, 960×900 и 1280×900, включая выбранный фон,
StatusPicker, empty document, More sheet и block menu. На 390 px toolbar имеет
одинаковые `clientWidth` и `scrollWidth` (368 px), горизонтального overflow нет.

Статус на 2026-07-16: **P1-B (`UX-024`–`UX-035`) реализован**.

- More использует непрозрачную поверхность, полные названия и 44 px mobile
  controls; иконка открытия заменена на ellipsis;
- Quick switcher поддерживает Arrow Up/Down, Home/End, Enter и ищет одновременно
  notes и actions; на mobile показывает Close вместо ложной подсказки `Esc`;
- Quick switcher и Template picker переведены на общий native-dialog foundation,
  получают правильный initial focus и возвращают его после закрытия;
- Settings доступны из mobile Details, а ложные mobile collapse controls удалены;
- note action menu содержит `Move to folder` и открывает touch-safe folder picker;
- folder rows больше не показывают пустой twisty, используют единый overflow с
  New subfolder, Rename и Delete, а Rename обозначен карандашом;
- browser prompt/confirm для папок заменены на `PromptDialog` и
  `ConfirmationDialog` в стиле lock-window;
- логотип снова открывает фирменный Home/empty-player; на mobile переход сразу
  переводит интерфейс во вкладку Editor, чтобы состояние было видимо;
- responsive collapse продолжает храниться отдельно от пользовательского
  состояния панелей.

На 390×844 проверены Command search, mobile Close, focus restore, Template
initial focus, folder prompt, note menu, Move picker, Details Settings и
отсутствие ложных Collapse. Save и Lock имеют одинаковую геометрию 38×38 px и
одинаковые glyph 16 px; display Garamond возвращён к тонкому весу 300.

| ID | Проблема | Что делаем |
| --- | --- | --- |
| UX-011 | Текст внутри плеера оптически собран неверно (`troubles/7.png`): subtitle слишком близко к `Ready to record`, группа выглядит зажатой и нецентрированной. | Центрируем copy как единую группу по доступной области экрана, задаём независимый адаптивный gap и опускаем subtitle. Проверяем 821, 1121 и mobile. |
| UX-012 | На 821/1121 px графика `hello` и subtitle плеера обрезаются. | Ограничиваем внутреннюю типографику container-размером, задаём безопасные поля экрана и скрываем/заменяем плеер на compact CTA, если его минимальная ширина не соблюдается. |
| UX-013 | Фоны и их preview чрезмерно выбелены (`troubles/6.png`), варианты почти неразличимы. | Ослабляем wash/overlay отдельно для preview и рабочей поверхности, настраиваем контраст для каждого ассета и проверяем читаемость текста поверх него. |
| UX-014 | Названия `FON 01…13` ничего не объясняют; Background фактически влияет преимущественно на empty state. | Даём осмысленные названия, уточняем scope настройки (`Empty screen background` либо реальный workspace background), добавляем Reset/None. |
| UX-015 | Геометрия редактора тегов и статуса несогласована (`troubles/5.png`): разные начала, ширины, высоты и пустая колонка. | Вводим общую property-grid: label сверху, control на всю доступную ширину; tag input и Add образуют устойчивую строку, chip и счётчик выровнены по одной сетке. |
| UX-016 | Native `<select>` статуса открывает синее системное меню (`troubles/1.png`) и полностью ломает арт-направление. | Строим доступный custom listbox/popover `StatusPicker` в духе lock-window: Idea, In progress, Done и No status получают спокойные символы/тона, клавиши стрелок, Enter и Escape. |
| UX-017 | Декоративные линии в заголовке Details наезжают на `SAVED LOCALLY` (`troubles/2.png`). | Выносим линию в отдельный flex-элемент между заголовком и статусом, задаём min-gap, `min-width: 0` и безопасное сокращение статуса на узкой панели. |
| UX-018 | Текущая папка обозначена слабой серой строкой `Root` (`troubles/3.png`); неясно, это breadcrumb, фильтр или домашняя папка. | Унифицируем термины `All notes`/folder name, добавляем явный active-state и рабочий breadcrumb/heading. Кнопка создания папки визуально отделяется от выбора текущей папки. |
| UX-019 | Inspector после создания заметки автоматически скрывается даже на широком desktop, поэтому свойства шаблона сразу исчезают. | Сворачиваем Inspector только при недостатке места. На широком desktop сохраняем пользовательское состояние или кратко показываем созданные status/tags. |
| UX-020 | Пустой mobile editor — большое белое поле без placeholder и явной точки входа. | Добавляем спокойный editor placeholder, корректный initial caret и минимальную подсказку, исчезающую после первого ввода. |
| UX-021 | Mobile toolbar визуально обрезан; `Numbers`, More, Undo и Redo находятся за экраном без признака горизонтального скролла. | Оставляем основные действия в видимой группе, вторичные переносим в явное More; добавляем edge-fade/индикатор только если горизонтальный scroll остаётся. |
| UX-022 | Block handle скрыт на mobile, поэтому duplicate, move, delete и turn-into недоступны. | Даём touch-friendly block menu по long-press/явной кнопке активного блока; drag получает кнопочные Move up/down как доступную альтернативу. |
| UX-023 | More menu перегружено инженерными командами `M-`, `OUT`, `C+`, `HD`, pixel offsets и противоречит компактному продукту. | Убираем page pixel offsets и произвольные margins из основной версии. Оставляем только полезные блоки, таблицу и редкие форматирования с понятными названиями. |
| UX-024 | More menu полупрозрачно, пропускает текст заметки, перекрывает документ; мобильные кнопки слишком малы. | Используем непрозрачную тёплую поверхность, 40–44 px touch targets, ясные секции и корректное позиционирование внутри viewport. Gear заменяем на ellipsis/more. |
| UX-025 | Quick switcher не поддерживает Arrow Up/Down и Enter. | Реализуем roving active item, стрелки, Enter, Home/End и видимое selected-состояние. |
| UX-026 | При вводе запроса actions исчезают: запрос `settings` не находит Settings. | Поиск работает и по заметкам, и по действиям; результаты группируются и ранжируются. |
| UX-027 | На mobile Quick switcher показывает `Esc`, но не имеет видимой кнопки закрытия. | На touch заменяем `Esc` на Close, добавляем drag-handle только если это действительно bottom sheet. Учитываем virtual keyboard. |
| UX-028 | Quick switcher и Template picker не имеют полноценного focus trap/restore; Template picker не получает начальный фокус. | Переводим на общий dialog foundation или добавляем эквивалентное управление фокусом и inert background. |
| UX-029 | Settings скрыты из mobile topbar и обнаруживаются только внутри кнопки, похожей на Search. | Либо обозначаем кнопку как command/menu, либо даём Settings устойчивое место в Details/overflow. Не расширяем topbar третьей постоянной кнопкой на 320 px. |
| UX-030 | Mobile-кнопки `Collapse notes/details` фактически переключают вкладку Editor, но подписаны как сворачивание. | Убираем их в tab-layout или меняем на честную навигацию Back to editor. Desktop collapse остаётся отдельным действием. |
| UX-031 | После перехода mobile → desktop автоматически свёрнутые панели не восстанавливаются. | Разделяем responsive collapse и пользовательское collapse-state. При смене breakpoint вычисляем layout заново, не перезаписывая явный выбор пользователя. |
| UX-032 | Перемещение заметки в папку на mobile возможно только через drag-and-drop. | Добавляем `Move to folder` в меню заметки и touch-friendly picker папки. Drag остаётся ускорителем на desktop. |
| UX-033 | Folder controls по 24 px тесны для touch; gear означает Rename; пустая папка показывает бледную неактивную стрелку. | На touch скрываем вторичные действия в overflow, используем pencil для Rename, не рисуем twisty без children, обеспечиваем 40–44 px hit area. |
| UX-034 | Создание папки использует `window.prompt`, удаление папки — browser confirm. | Используем `PromptDialog` и `ConfirmDialog` на базе lock-window. Добавляем inline validation и описываем, что произойдёт с вложенными заметками. |
| UX-035 | Нажатие на логотип должно открывать фирменный Home, но состояние обязано быть видимым и предсказуемым на любом breakpoint. | Сохраняем Home/empty-player как осознанное состояние: логотип очищает выбор заметки, сбрасывает папку и на mobile открывает вкладку Editor. Выбор заметки, папки или создание документа выводят из Home. |

### P2 — визуальная система, доступность и бренд

Статус на 2026-07-17: **P2 (`UX-036`–`UX-047`) реализован**.

- внутренние пустые карточки и диагностическая рамочность ослаблены; ретро-рамка
  остаётся у app chrome, editor paper, контролов и dialog;
- функциональная microtype поднята до 11.5–12 px, mobile tab labels — до 12 px,
  inactive tabs используют контрастный `--sn-muted`;
- введены роли `selection`, `success`, `pending`, `danger`; декоративная
  calibration strip приглушена и не обозначает состояние;
- небезопасный UI scale из P0 не возвращён, мёртвый native-range удалён из CSS;
- Inspector Info оставляет Folder, Updated, Privacy и Created, без повторного
  saved-state и `Local revision`;
- Library показывает page status, два первых тега и явный `+N`; empty state
  получил текстовую CTA, а дублирующая кнопка создания в Library удалена;
- Blank, Daily, Meeting и Project получили разные структурные пиктограммы;
- web title, PWA, npm/Cargo/Tauri package metadata и window title унифицированы
  как Umbra Silico; PWA использует кремовые theme/background colors и
  `orientation: any`;
- Cormorant Garamond self-hosted, внешние Google Fonts requests удалены, WOFF2
  входит в offline precache; системных prompt/confirm/alert в UI нет.

В Chromium проверены 320×844, 390×844, 768×844, 960×900, 1280×900 и
1440×900. На всех ширинах `scrollWidth === clientWidth` у viewport/workspace;
на mobile видна одна панель, на compact desktop — Library + Editor, на full
desktop — все три панели. В runtime нет внешних font resources.

| ID | Проблема | Что делаем |
| --- | --- | --- |
| UX-036 | Слишком много вложенных рамок, сеток и одинаково весомых поверхностей. | Сохраняем ретро-рамку только для значимых объектов: app chrome, editor paper и dialog. Уменьшаем количество границ внутри Library/Inspector. |
| UX-037 | Функциональный текст 10–11 px слишком мелок; inactive mobile tabs имеют контраст около 3.2:1. | Поднимаем минимальный функциональный размер, усиливаем контраст интерактивных muted-состояний и отдельно проверяем 90% scale. |
| UX-038 | Синий active note, синий range, синий Play, зелёный local и янтарный dirty не образуют ясной семантики. | Фиксируем короткую semantic palette: selection, success, pending, danger. Декоративная calibration strip не диктует состояния. |
| UX-039 | Нативный range в Settings визуально не принадлежит системе. | Не возвращаем небезопасный `body zoom`: настройка scale остаётся исключённой из первой версии, а мёртвый CSS native-range удалён. |
| UX-040 | Inspector повторяет saved-state, но большая часть панели пуста и содержит технический local revision. | В Properties оставляем действия, в Info — только полезные человеку метаданные. Диагностические поля скрываем из основной версии. |
| UX-041 | Note card показывает максимум два тега без `+N`; status страницы в Library не виден. | Добавляем `+N` и компактный, ненавязчивый status marker, если он улучшает сканирование и не перегружает карточку. |
| UX-042 | Empty Library на mobile сообщает «Start with a blank local note», но не содержит CTA; одновременно выше есть две кнопки `+`. | Оставляем одну устойчивую primary action в header и текстовую CTA в empty state либо убираем дублирование. |
| UX-043 | Daily, Meeting и Project templates имеют одинаковую иконку. | Добавляем простые структурные пиктограммы/мини-превью, не вводя отдельную иллюстративную систему. |
| UX-044 | Внутри продукт называется Umbra Silico, а document title, PWA manifest и Tauri package — Silicon Nostalgia. | Унифицируем product name, short name, install metadata и window title. |
| UX-045 | Фирменная гарнитура зависит от Google Fonts; в offline-проверке произошёл fallback. | Self-host используемые начертания, удаляем внешние font requests, задаём метрически совместимый fallback. |
| UX-046 | PWA `theme-color` чёрный при кремовом UI, а `orientation: portrait` блокирует landscape. | Согласуем theme/background colors с app chrome и разрешаем подходящую ориентацию для редактора. |
| UX-047 | Browser/system dialogs смешивают русский chrome браузера и английские строки приложения. | После замены системных окон все пользовательские тексты контролируются приложением; локализацию рассматриваем отдельно, не в этом цикле. |

## План реализации

### Этап 0. Зафиксировать визуальный контракт

1. Выделить tokens для dialog, paper, border, bevel, semantic colors и focus.
2. Описать состояния note persistence: `saving`, `saved-local`, `syncing`,
   `synced`, `attention`.
3. Описать состояния privacy: `local`, `locked`, `unlocked-session`.
4. Зафиксировать layout modes по фактической доступной ширине editor:
   mobile tabs, compact desktop и full desktop.

Готово, когда один и тот же статус имеет одинаковые текст, иконку и цвет во
всех компонентах, а layout matrix покрывает контрольные ширины.

### Этап 1. Доверие и системные окна

1. Создать `RetroDialogShell` на основе окна блокировки.
2. Заменить permanent-delete confirm и folder-delete confirm.
3. Заменить folder prompt для create/rename.
4. Исправить lock/unlock: два поля при lock, reveal, focus, видимый Close.
5. Убрать невидимую mobile delete-button и добавить явное note action menu.
6. Исправить privacy и save/sync semantics.

Готово, когда в коде пользовательского UI нет `window.prompt`/`window.confirm`,
а необратимое действие невозможно выполнить невидимым или случайным нажатием.

### Этап 2. Responsive foundation

1. Убрать `body zoom` и реализовать безопасный scale либо временно скрыть его.
2. Исправить breakpoint cliffs 820/821 и 1120/1121.
3. Разделить responsive и user collapse-state.
4. Перевести чувствительные компоненты плеера/editor header/toolbar на
   container-aware размеры.
5. Проверить safe-area, short viewport и virtual keyboard.

Готово, когда ни один контрольный viewport и 90/100/115% scale не создаёт
горизонтальный overflow, обрезанный CTA или контент под tab bar.

### Этап 3. Editor и плеер

1. Исправить оптическую позицию `Ready to record` и subtitle.
2. Задать compact empty state при недостаточной ширине плеера.
3. Добавить placeholder пустого документа.
4. Пересобрать mobile toolbar вокруг частых действий.
5. Сократить More menu и сделать его непрозрачным/touch-safe.
6. Вернуть block actions на mobile через явное меню.

Готово, когда новый пользователь понимает, куда писать, все обязательные block
actions доступны пальцем, а More menu не показывает инженерные сокращения.

### Этап 4. Inspector, свойства и папки

1. Исправить линию и геометрию header Details.
2. Пересобрать property-grid и tag editor.
3. Заменить native status select на `StatusPicker`.
4. Сделать текущую папку и breadcrumb однозначными.
5. Добавить mobile `Move to folder`.
6. Упростить folder actions и термины `Root`/`All notes`.

Готово, когда Properties выглядит как одна система полей, текущая папка всегда
понятна, а статус и папку можно изменить клавиатурой и touch.

### Этап 5. Navigation и dialog accessibility

1. Добавить keyboard navigation Quick switcher.
2. Искать одновременно notes и actions.
3. Исправить mobile Close и поведение virtual keyboard.
4. Применить dialog focus foundation к Quick switcher/Template picker.
5. Убрать ложные mobile collapse-actions.
6. Упростить поведение логотипа/Home.

Готово, когда каждый overlay полностью управляется Tab, Shift+Tab, стрелками,
Enter и Escape, а после закрытия фокус возвращается на исходный control.

### Этап 6. Арт-дирекция и бренд

1. Ослабить лишние рамки и фоновые линии.
2. Исправить microtype и contrast.
3. Нормализовать semantic palette и native controls.
4. Улучшить preview/названия backgrounds и templates.
5. Унифицировать Umbra Silico во всех manifest/window metadata.
6. Self-host fonts и проверить offline-вид.
7. Согласовать PWA theme-color и orientation.

Готово, когда offline и installed версии визуально совпадают с web-preview, а
каждый цвет и декоративный приём имеет одну понятную роль.

## Порядок поставки

Рекомендуемые небольшие PR/коммиты:

1. `ui: add retro dialog foundation and safe destructive actions`
2. `ui: unify persistence and privacy states`
3. `ui: stabilize responsive layout and remove body zoom`
4. `ui: refine player and mobile editor controls`
5. `ui: rebuild properties, status picker and folder context`
6. `ui: complete keyboard navigation and focus management`
7. `ui: finish visual system, offline fonts and branding`

Нельзя смешивать все этапы в один CSS-коммит: responsive foundation,
interaction semantics и декоративная полировка должны проверяться отдельно.

## Матрица проверки

### Viewports

- 320×568, 360×800, 390×844, 430×932;
- 768×1024, 820×900, 821×900;
- 1024×900, 1120×900, 1121×900;
- 1280×900, 1440×1000.

### Состояния

- новая пустая библиотека;
- одна пустая заметка;
- длинная заметка с таблицей/task/toggle/callout;
- 12 tags и длинные tag names;
- вложенные папки и длинное имя текущей папки;
- locked note и unlock-session;
- Trash с locked/plain notes;
- local-only, remote syncing, sync error;
- background None и наиболее контрастные варианты;
- UI scale 90%, 100%, 115% после безопасной реализации.

### Interaction

- keyboard-only: Tab, Shift+Tab, arrows, Enter, Escape, Ctrl/⌘ K;
- touch-only без hover;
- resize/orientation в обе стороны;
- virtual keyboard на Quick switcher, tags и editor;
- offline reload без внешних font requests;
- reduced motion;
- отсутствие невидимых кликабельных destructive controls.

## Release gate

Работа считается завершённой, когда:

- закрыты все P0 и P1;
- P2 либо закрыты, либо явно перенесены с причиной;
- нет browser `prompt/confirm` в пользовательских сценариях;
- status/privacy semantics непротиворечивы;
- контрольные ширины проходят визуальный smoke test;
- automated check, tests, lint и production build зелёные;
- desktop, mobile и offline screenshots подтверждают одну визуальную систему.
