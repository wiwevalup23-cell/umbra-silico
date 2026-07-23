// Ported from the "Циркуль" (Compass) handoff — Тур 3, final direction.
// Geometry is generated with the same helpers as the source design doc so
// the path data stays pixel-identical to what was approved.

export type CompassIconPath = {
  d: string
  f: string
}

function circle(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`
}

function dot(cx: number, cy: number, r: number): string {
  return circle(cx, cy, r)
}

const slashCircle = `${circle(10, 10, 6.6)}M5.35 5.35L14.65 14.65`
const loop = 'M14 5.2A6.2 6.2 0 1 0 16.2 10M14 5.2L14.9 2.5M14 5.2L11.2 4.4'
const spiral =
  'M10 10c0-1 .8-1.8 1.8-1.8 1.6 0 2.8 1.3 2.8 2.8 0 2.3-1.9 4.2-4.2 4.2-3.1 0-5.6-2.5-5.6-5.6C4.8 6 7.3 3.5 10.4 3.5c3.9 0 7.1 3.2 7.1 7.1'
const wave =
  'M2.5 8.2C5 5.8 7.5 5.8 10 8.2C12.5 10.6 15 10.6 17.5 8.2M2.5 12.8C5 10.4 7.5 10.4 10 12.8C12.5 15.2 15 15.2 17.5 12.8'

export type CompassFormatIconName =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'code'
  | 'quote'
  | 'heading1'
  | 'heading2'
  | 'bulletList'
  | 'numberedList'
  | 'checkbox'
  | 'toggle'
  | 'divider'
  | 'callout'
  | 'image'
  | 'table'
  | 'undo'
  | 'redo'

// 16px formatting toolbar row ("ПАНЕЛЬ ФОРМАТИРОВАНИЯ").
export const compassFormatIcons: Record<CompassFormatIconName, CompassIconPath> = {
  bold: {
    d: 'M6.5 3.5V17.5M6.5 3.5H10.8A3.4 3.4 0 0 1 10.8 10.3H6.5M6.5 10.3H11.8A3.6 3.6 0 0 1 11.8 17.5H6.5',
    f: '',
  },
  italic: { d: 'M9 3.5H15M5 16.5H11M12 3.5L8 16.5', f: '' },
  strikethrough: {
    d: 'M13.4 5.2C12.3 4 10.4 3.6 8.9 4.1C7.5 4.5 6.6 5.6 6.8 7C7 8.4 8.5 9.1 10 9.6M10 10.4C11.5 10.9 13.2 11.7 13.3 13.2C13.4 14.8 12.2 15.9 10.5 16.3C8.8 16.7 7.1 16 6.2 14.8M3.5 10H16.5',
    f: '',
  },
  code: { d: 'M7 5.5L3.5 10L7 14.5M13 5.5L16.5 10L13 14.5', f: '' },
  quote: {
    d: `${circle(5.9, 11.8, 2.2)}M3.7 11.8C3.7 8.7 4.6 6.5 6.6 4.9${circle(13.5, 11.8, 2.2)}M11.3 11.8C11.3 8.7 12.2 6.5 14.2 4.9`,
    f: '',
  },
  heading1: { d: 'M3 4.5V15.5M3 10H8.5M8.5 4.5V15.5M13.5 6.8L15.9 4.5V15.5', f: '' },
  heading2: {
    d: 'M2.5 4.5V15.5M2.5 10H8M8 4.5V15.5M12.4 7.6A2.7 2.7 0 0 1 17.6 8.4C17.6 10.7 12.4 12.6 12.4 15.5H17.8',
    f: '',
  },
  bulletList: {
    d: 'M8.5 5.2H17M8.5 10H17M8.5 14.8H17',
    f: 'M3.6 5.2a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0M3.6 10a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0M3.6 14.8a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0 -2.3 0',
  },
  numberedList: {
    d: 'M9 5.2H17M9 14.8H17M3.4 4L5.1 3V7.4M3.1 12.4A1.7 1.7 0 0 1 6.3 13.1C6.3 14.6 3.1 15.2 3.1 16.8H6.5',
    f: '',
  },
  checkbox: { d: 'M4 4.5H16V16.5H4ZM7 10.6L9.4 13L13.4 7.6', f: '' },
  toggle: { d: 'M8 4.5V15.5L16 10ZM4.5 4.5V15.5', f: '' },
  divider: { d: 'M3 10H7.4M12.6 10H17', f: 'M10 7.8L12.2 10L10 12.2L7.8 10Z' },
  callout: {
    d: 'M3.5 4.5H16.5V12.5H10.5L7 15.8V12.5H3.5ZM10 6.8V9.6',
    f: 'M9.1 11.4a.9.9 0 1 0 1.8 0a.9.9 0 1 0 -1.8 0',
  },
  image: {
    d: `M3 4.5H17V15.5H3ZM3 13.5L7.5 9L11 12.5L13 10.5L17 14.5${circle(14, 7.5, 1.7)}`,
    f: dot(14, 7.5, 0.6),
  },
  table: { d: 'M3.5 4.5H16.5V15.5H3.5ZM3.5 8.5H16.5M10 8.5V15.5', f: '' },
  undo: { d: 'M6.2 4.8L3 8L6.2 11.2M3 8H11.4A4.6 4.6 0 0 1 11.4 17.2H7.5', f: '' },
  redo: { d: 'M13.8 4.8L17 8L13.8 11.2M17 8H8.6A4.6 4.6 0 0 0 8.6 17.2H12.5', f: '' },
}

export type CompassCoreStatusName = 'none' | 'idea' | 'inProgress' | 'done'

// 20px page-status icons ("СТАТУСЫ СТРАНИЦ"). `none` is an app-specific
// neutral ring — the source design only covers idea/in-progress/done.
export const compassCoreStatusIcons: Record<CompassCoreStatusName, CompassIconPath> = {
  none: { d: circle(10, 10, 6.6), f: '' },
  idea: {
    d: `M10 2.8V5.4M10 14.6V17.2M2.8 10H5.4M14.6 10H17.2${circle(10, 10, 3.3)}`,
    f: dot(10, 10, 1.05),
  },
  inProgress: { d: circle(10, 10, 6.6), f: 'M10 3.4a6.6 6.6 0 0 1 0 13.2Z' },
  done: { d: `${circle(10, 10, 6.6)}M6.9 10.4L9.1 12.5L13.3 7.9`, f: '' },
}

export type CompassCustomStatusName =
  | 'waiting'
  | 'pause'
  | 'review'
  | 'archive'
  | 'block'
  | 'someday'
  | 'focus'
  | 'important'
  | 'repeat'
  | 'spiral'
  | 'connection'
  | 'wave'
  | 'arrow'
  | 'key'
  | 'infinity'
  | 'windRose'

// Symbols for custom statuses ("СИМВОЛЫ ДЛЯ СВОИХ СТАТУСОВ · 16 ШТ").
export const compassCustomStatusIcons: Record<CompassCustomStatusName, CompassIconPath> = {
  waiting: {
    d: 'M6 3.5H14M6 16.5H14M6.8 3.5C6.8 7.2 10 7.6 10 10C10 12.4 6.8 12.8 6.8 16.5M13.2 3.5C13.2 7.2 10 7.6 10 10C10 12.4 13.2 12.8 13.2 16.5',
    f: `${dot(10, 14.8, 0.9)}${dot(10, 11.9, 0.5)}`,
  },
  pause: { d: 'M7.2 4.5V15.5M12.8 4.5V15.5', f: '' },
  review: {
    d: `M2.6 10C5.2 5.9 14.8 5.9 17.4 10C14.8 14.1 5.2 14.1 2.6 10Z${circle(10, 10, 2.1)}`,
    f: dot(10, 10, 0.8),
  },
  archive: { d: 'M3 4.5H17V8H3ZM4.5 8V15.5H15.5V8M8.2 10.8H11.8', f: '' },
  block: { d: slashCircle, f: '' },
  someday: { d: 'M10 3L17 10L10 17L3 10Z', f: 'M10 8.2L11.8 10L10 11.8L8.2 10Z' },
  focus: {
    d: `${circle(10, 10, 6.6)}${circle(10, 10, 2.6)}M10 2.2V4.4M10 15.6V17.8M2.2 10H4.4M15.6 10H17.8`,
    f: dot(10, 10, 1.1),
  },
  important: { d: 'M5.5 17V3.5M5.5 4.5H14.5L12.2 7.2L14.5 9.9H5.5', f: '' },
  repeat: { d: loop, f: '' },
  spiral: { d: spiral, f: dot(10, 10, 0.8) },
  connection: { d: `${circle(7.8, 10, 5.2)}${circle(12.2, 10, 5.2)}`, f: dot(10, 10, 1) },
  wave: { d: wave, f: '' },
  arrow: { d: 'M4.5 15.5L15.5 4.5M15.5 4.5H9.8M15.5 4.5V10.2', f: '' },
  key: { d: `${circle(6.8, 6.8, 3.2)}M9.1 9.1L16.6 16.6M13.6 13.6L15.7 11.5`, f: dot(6.8, 6.8, 0.95) },
  infinity: {
    d: 'M10 10C8.7 11.6 7.4 12.4 6 12.4A2.7 2.7 0 0 1 6 7.6C7.4 7.6 8.7 8.4 10 10C11.3 11.6 12.6 12.4 14 12.4A2.7 2.7 0 0 0 14 7.6C12.6 7.6 11.3 8.4 10 10Z',
    f: '',
  },
  windRose: {
    d: `M10 4.4L11.5 8.5L15.6 10L11.5 11.5L10 15.6L8.5 11.5L4.4 10L8.5 8.5Z${circle(10, 10, 7.3)}`,
    f: dot(10, 10, 0.8),
  },
}
