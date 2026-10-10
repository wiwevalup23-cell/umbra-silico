# Промпт для нейросети: скевоморфные ассеты боковых панелей

Дата: **10.10.2026**. Цель: получить от генератора изображений боковые панели
Umbra Silico, которые выглядят как предметы из того же пластика, что и плеер на
главном экране. Дальше мы их режем, подгоняем и встраиваем.

## Что приложить к промпту

Папка `papers/skeuo-panels-prompt-2026-10-10/`:

| Файл | Зачем |
|---|---|
| `01-player-platinum.png` | **главный референс стиля**: материал, фаски, свет, цвет |
| `02-player-crt-room.png` | референс для тёмной темы CRT Room (промпт 3) |
| `05-library-panel-layout@2x.png` | раскладка левой панели: что за чем идёт |
| `03-app-now-platinum.png`, `04-app-now-crt-room.png` | приложение целиком: масштаб и соседи панели |

Приложить можно и пару картинок из `refrenses/` (Mac OS X 10.0–10.3) — это
то же время и тот же дух.

## Как пользоваться

1. Сначала **промпт 1** (панель целиком) — 3–5 вариантов, выбрать лучший по духу.
2. Затем **промпт 2** (лист компонентов) с выбранным вариантом в качестве
   дополнительного референса — так компоненты выйдут в том же материале.
3. **Промпт 3** — то же для CRT Room.
4. Сохранять PNG без сжатия, по ширине не меньше 600px на панель (это 2x).

Честно о том, что получится: генераторы искривляют прямые линии, путают
толщину фасок и пишут текст кашей. Поэтому текст и иконки в промптах запрещены —
они в приложении живые. Результат используем так: где можно — снимаем с
картинки цвета, фаски, свет и фактуру и собираем материал в CSS (чётко на любом
экране и во всех темах); где CSS не справится (литой пластик, решётка динамика,
сложная фаска угла) — режем растр в 9-slice (`border-image`) с подложками 2x.

---

## Промпт 1 — панель целиком (поиск образа)

```
A tall vertical sidebar panel for a desktop notes app, designed as a physical
object made of exactly the same material as the attached media player image:
warm off-white injection-moulded plastic, softly rounded corners, crisp but
gentle bevels, a thin lighter highlight on top edges and a slightly darker rim
on bottom edges, very subtle horizontal pinstripes in the plastic, soft light
from directly above, a soft contact shadow underneath. Late-1990s / early-2000s
Apple hardware and Mac OS X 10.0–10.3 Platinum spirit — careful, light, elegant
skeuomorphism, not glossy Aqua jelly, not chrome, not wood or leather.

Front orthographic view, perfectly flat-on, no perspective, no tilt, no scene,
no hands, no desk objects. Panel is 300 × 800 units (render at 600 × 1600 px),
placed centred on a flat plain background #e1dcd2 with generous margin.

From top to bottom, the panel contains:
1. A titlebar strip across the full width (about 52 units tall): slightly lighter
   than the body, a moulded horizontal ridge of fine engraved lines on the right
   half, and at the right end a small square key with rounded corners (like the
   player's transport keys) that holds a left-pointing chevron.
2. A pill-shaped search field (about 32 units tall) sunk into the plastic:
   recessed, inner shadow along its top edge, a light lip along its bottom edge,
   a small magnifier glyph at its left end.
3. A short list of three folder rows; the selected row is a raised rounded
   lozenge of the same plastic with a soft highlight.
4. A deep rounded tray (corner radius about 14) recessed into the body, holding
   four stacked index cards: each card is a slightly raised paper-white plate with
   rounded corners (radius about 10), a hairline edge and a tiny shadow; under the
   first line of every card runs one thin faded red rule, like a library index
   card. The selected card is lifted a little higher with a longer soft shadow.
5. A status bar at the bottom (about 40 units tall) with a small square key
   holding a waste-bin glyph at the left and a small green indicator dot at the
   right.

Colour palette taken from the player: body #f0ebdf to #faf8f0, rim #c5beac,
recess shadow #d9d3c2, accent blue #215ea0 used only as a tiny touch, ink
#1c1b18 for glyphs. Glyphs are simple thin line icons in dark ink.

NO TEXT anywhere: wherever text would be, draw short soft grey placeholder bars
instead. No letters, no numbers, no logos, no watermark.
```

**Чего избегать** (для генераторов с отдельным полем negative prompt):

```
text, letters, words, numbers, logo, watermark, perspective, isometric, 3d scene,
tilted view, glossy aqua gel, chrome, metal, wood, leather, neon, glow,
heavy drop shadow, dark background, photo of a device, hands, cables, clutter,
blurry, jpeg artifacts, uneven lines, warped edges
```

---

## Промпт 2 — лист компонентов для нарезки

```
A UI kit sheet of separate skeuomorphic interface components, all made of the
same warm off-white moulded plastic as the attached media player (and the attached
sidebar panel concept): soft top light, gentle bevels, light top highlight, darker
bottom rim, subtle pinstripe texture. Front orthographic view, perfectly flat-on,
no perspective. Components are laid out in a clean grid on a flat plain background
#e1dcd2, each separated by at least 40 px of empty space, nothing overlapping,
nothing cropped. Render at 2× scale (sizes below are at 1×).

Components:
1. Panel body corner pieces: one large rounded rectangle 300 × 400 with corner
   radius 16, plain body plastic, highlight on the top edge, darker rim at the
   bottom — edges must be straight and uniform so it can be stretched (9-slice).
2. Titlebar strip 300 × 52, empty, with the fine engraved ridge lines on the right
   half and a lighter gradient than the body.
3. Search field, pill shape 276 × 32, recessed, empty.
4. Folder row lozenge 284 × 30, raised, selected state.
5. Recessed tray 276 × 300, corner radius 14, empty.
6. Index card 264 × 72 in three states side by side: resting, hovered (lifted by
   1 unit, slightly longer shadow), selected (lifted more, darker hairline edge).
   Each has one thin faded red rule 26 units below its top edge. No text.
7. Status bar strip 300 × 40, empty.
8. Small square key 30 × 28 with rounded corners (radius 9) in two states:
   resting and pressed (sunk 2 units, inner shadow). Empty, no glyph.
9. Large keycap 190 × 38 (radius 10) in two states, resting and pressed, as for a
   keyboard key placed under the player.

Palette: body #f0ebdf to #faf8f0, rim #c5beac, recess shadow #d9d3c2, card paper
#fffefa, faded red rule #b4685f at low opacity. No text, no icons, no letters,
no numbers, no logos.
```

---

## Промпт 3 — то же для темы CRT Room

Использовать промпты 1 и 2, заменив абзац о цвете на этот и приложив
`02-player-crt-room.png` вместо `01-player-platinum.png`:

```
Same objects, but in the dark plum plastic of the attached CRT-style player:
body #3b2a3e to #443246, rim #5b485c, recess shadow #241828, cards #402e43 with a
faint lighter top highlight, the red rule replaced by a faded soft coral
#ec8f8d at low opacity, glyphs in light lavender ink #e6e3ec, the accent a soft
violet #b790ec used only as a tiny touch. Flat plain background #1d0f25. Highlights
are faint and cool, shadows are deep but soft. No glow, no neon, no scanlines.
```

---

## Что прислать обратно

- 2–3 лучших варианта по промпту 1 (Platinum), 1–2 по промпту 3 (CRT);
- лист компонентов (промпт 2) в выбранном стиле для обеих тем;
- PNG, ширина панели не меньше 600px.

С этим я: сниму с картинок цвета, фаски, свет и фактуру; соберу то, что
можно, в CSS на токенах (чётко на любом экране, во всех темах); остальное
нарежу в 9-slice с версиями 1x/2x; посажу на текущую разметку панели — текст,
иконки и состояния останутся живыми.
