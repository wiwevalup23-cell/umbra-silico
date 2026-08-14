export type StatusMarkerIconPart = {
  d: string
  fill?: 'currentColor' | 'none'
  stroke?: 'currentColor' | 'none'
}

export const statusMarkerIconParts = {
  'status.none': [
    { d: 'M6.4 12 a5.6 5.6 0 1 0 11.2 0 a5.6 5.6 0 1 0 -11.2 0' },
  ],
  'status.incoming': [
    { d: 'M9.8 7.2 H5.2 V17.4 H18.8 V7.2 H14.2' },
    { d: 'M10.4 7.2 a1.6 1.6 0 1 0 3.2 0 a1.6 1.6 0 1 0 -3.2 0', fill: 'currentColor', stroke: 'none' },
  ],
  'status.draft': [
    { d: 'M18.8 5.2 C13.2 4.8 9 8.8 9.4 14.4 C15 14.8 19.2 10.8 18.8 5.2 Z' },
    { d: 'M18.8 5.2 L5.2 18.8' },
  ],
  'status.in_progress': [
    { d: 'M4.4 17.8 H19.6' },
    { d: 'M7.6 13.9 L12 8.6 L16.4 13.9' },
    { d: 'M10.6 4.8 a1.4 1.4 0 1 0 2.8 0 a1.4 1.4 0 1 0 -2.8 0', fill: 'currentColor', stroke: 'none' },
  ],
  'status.deferred': [
    { d: 'M4.8 17.8 V12 A7.2 7.2 0 0 1 19.2 12 V17.8' },
    { d: 'M10.3 15.2 a1.7 1.7 0 1 0 3.4 0 a1.7 1.7 0 1 0 -3.4 0', fill: 'currentColor', stroke: 'none' },
  ],
  'status.waiting': [
    { d: 'M5.2 8.8 V15.2 H18.8 V8.8' },
    { d: 'M10.2 4.8 a1.8 1.8 0 1 0 3.6 0 a1.8 1.8 0 1 0 -3.6 0', fill: 'currentColor', stroke: 'none' },
  ],
  'status.review': [
    { d: 'M4.8 12 Q12 4.4 19.2 12 Q12 19.6 4.8 12 Z' },
    { d: 'M12 4 V7.2' },
  ],
  'status.completed': [
    { d: 'M5 12 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0' },
    { d: 'M5.5 14.6 A7 7 0 0 0 18.5 14.6 Z', fill: 'currentColor', stroke: 'none' },
  ],
  'status.archived': [
    { d: 'M6.6 9.8 a5.4 5.4 0 1 0 10.8 0 a5.4 5.4 0 1 0 -10.8 0' },
    { d: 'M4.4 18.2 H19.6' },
  ],
  'marker.important': [
    { d: 'M12 3 C12.85 9.15 15.15 11.15 21 12 C15.15 12.85 12.85 14.85 12 21 C11.15 14.85 8.85 12.85 3 12 C8.85 11.15 11.15 9.15 12 3 Z' },
  ],
  'marker.favorite': [
    { d: 'M7 4.8 H10.8 L12 6.4 L13.2 4.8 H17 V19.6 L12 15.4 L7 19.6 Z' },
  ],
  'marker.return': [
    { d: 'M4.8 7.4 H15 A4.5 4.5 0 0 1 15 16.4 H10.6' },
    { d: 'M12.4 14.6 L10.6 16.4 L12.4 18.2' },
    { d: 'M4.9 16.4 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0', fill: 'currentColor', stroke: 'none' },
  ],
  'marker.question': [
    { d: 'M7.6 8.4 A4.6 4.6 0 1 1 12 13.9' },
    { d: 'M12 13.9 V15.6' },
    { d: 'M10.45 19.5 a1.55 1.55 0 1 0 3.1 0 a1.55 1.55 0 1 0 -3.1 0', fill: 'currentColor', stroke: 'none' },
  ],
  'marker.idea': [
    { d: 'M13.8 7.9 a2.3 2.3 0 1 0 4.6 0 a2.3 2.3 0 1 0 -4.6 0', fill: 'currentColor', stroke: 'none' },
    { d: 'M13.2 10.6 L5.4 18.4' },
    { d: 'M16.9 12.6 L12.2 17.9' },
  ],
  'marker.observation': [
    { d: 'M10.2 12 a1.8 1.8 0 1 0 3.6 0 a1.8 1.8 0 1 0 -3.6 0', fill: 'currentColor', stroke: 'none' },
    { d: 'M12 3.4 V6.6 M12 17.4 V20.6 M3.4 12 H6.6 M17.4 12 H20.6' },
  ],
  'marker.source': [
    { d: 'M15.4 4.4 V19.6 M6.8 8.8 H15.4 M9.6 15.4 H15.4' },
    { d: 'M3.3 8.8 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0', fill: 'currentColor', stroke: 'none' },
    { d: 'M6.1 15.4 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0', fill: 'currentColor', stroke: 'none' },
  ],
  'marker.linked': [
    { d: 'M4.2 16.6 a1.6 1.6 0 1 0 3.2 0 a1.6 1.6 0 1 0 -3.2 0', fill: 'currentColor', stroke: 'none' },
    { d: 'M10.9 6.7 a1.6 1.6 0 1 0 3.2 0 a1.6 1.6 0 1 0 -3.2 0', fill: 'currentColor', stroke: 'none' },
    { d: 'M16.6 14.9 a1.6 1.6 0 1 0 3.2 0 a1.6 1.6 0 1 0 -3.2 0', fill: 'currentColor', stroke: 'none' },
    { d: 'M6.9 15 L11.4 8.3 M13.6 7.9 L17.4 13.4' },
  ],
  'marker.pinned': [
    { d: 'M12 3.4 L14.3 6.3 L12 9.2 L9.7 6.3 Z', fill: 'currentColor', stroke: 'none' },
    { d: 'M12 9.2 V20.6' },
  ],
  'marker.private': [
    { d: 'M7.4 5.4 H16.6 A2 2 0 0 1 18.6 7.4 V16.6 A2 2 0 0 1 16.6 18.6 H7.4 A2 2 0 0 1 5.4 16.6 V7.4 A2 2 0 0 1 7.4 5.4 Z' },
    { d: 'M12 5.4 V18.6' },
    { d: 'M10.1 12 a1.9 1.9 0 1 0 3.8 0 a1.9 1.9 0 1 0 -3.8 0', fill: 'currentColor', stroke: 'none' },
  ],
  'marker.conflict': [
    { d: 'M4.4 9.4 H12.6 M10.6 7.4 L12.6 9.4 L10.6 11.4' },
    { d: 'M19.6 14.6 H11.4 M13.4 12.6 L11.4 14.6 L13.4 16.6' },
  ],
  'marker.fragile': [
    { d: 'M11.2 3.8 V10 M12.8 13.4 V20.2 M9.2 3.8 H13.2 M10.8 20.2 H14.8' },
  ],
  'marker.dead_end': [
    { d: 'M5.4 14 A6.6 6.6 0 0 1 18.6 14 M5.4 14 H18.6 M6.8 17.4 L17.2 9.2' },
  ],
  'nocturne.draft': [
    { d: 'M6.8 9.6 a4.2 4.2 0 1 0 8.4 0 a4.2 4.2 0 1 0 -8.4 0' },
    { d: 'M10.6 8.9 a1.2 1.2 0 1 0 2.4 0 a1.2 1.2 0 1 0 -2.4 0', fill: 'currentColor', stroke: 'none' },
    { d: 'M14.9 8.4 L20.4 10.1 L14.9 12 M7.9 13.1 Q7.4 19.7 14.6 20.3' },
  ],
  'nocturne.pinned': [
    { d: 'M12 2.9 Q13 7.7 14.3 9 Q15.6 10.3 20.2 11.3 Q15.6 12.3 14.3 13.6 Q13 14.9 12 21.1 Q11 14.9 9.7 13.6 Q8.4 12.3 3.8 11.3 Q8.4 10.3 9.7 9 Q11 7.7 12 2.9 Z' },
  ],
  'nocturne.favorite': [
    { d: 'M12 12.5 C7.8 10.1 8.2 3.6 12 3.6 C15.8 3.6 16.2 10.1 12 12.5 Z M12 12.5 V20.6 M7.2 14.9 H16.8' },
  ],
  'nocturne.dead_end': [
    { d: 'M6.5 10.8 A5.5 5.5 0 0 1 17.5 10.8 V13.9 H14.6 V16.8 H9.4 V13.9 H6.5 Z' },
    { d: 'M8.3 10.3 a1.3 1.3 0 1 0 2.6 0 a1.3 1.3 0 1 0 -2.6 0', fill: 'currentColor', stroke: 'none' },
    { d: 'M13.1 10.3 a1.3 1.3 0 1 0 2.6 0 a1.3 1.3 0 1 0 -2.6 0', fill: 'currentColor', stroke: 'none' },
  ],
} as const satisfies Record<string, readonly StatusMarkerIconPart[]>

export type StatusMarkerIconName = keyof typeof statusMarkerIconParts

export const nocturneStatusMarkerSubstitutions: Partial<
  Record<StatusMarkerIconName, StatusMarkerIconName>
> = {
  'status.draft': 'nocturne.draft',
  'marker.favorite': 'nocturne.favorite',
  'marker.pinned': 'nocturne.pinned',
  'marker.dead_end': 'nocturne.dead_end',
}
