import type { SVGProps } from 'react';

export type UiIconName =
  | 'activity'
  | 'arrowDown'
  | 'arrowUp'
  | 'briefcase'
  | 'calendar'
  | 'chat'
  | 'check'
  | 'edit'
  | 'chevronDown'
  | 'chevronLeft'
  | 'chevronRight'
  | 'cloud'
  | 'close'
  | 'copy'
  | 'document'
  | 'folder'
  | 'folderPlus'
  | 'focus'
  | 'gripVertical'
  | 'history'
  | 'home'
  | 'image'
  | 'info'
  | 'library'
  | 'link'
  | 'lock'
  | 'moreHorizontal'
  | 'panelLeft'
  | 'panelRight'
  | 'plus'
  | 'refresh'
  | 'save'
  | 'search'
  | 'send'
  | 'settings'
  | 'shield'
  | 'tag'
  | 'template'
  | 'trash'
  | 'unlock'
  | 'users';

const paths: Record<UiIconName, string[]> = {
  activity: ['M3 12h4l2.5-7 5 14 2.5-7h4'],
  arrowDown: ['M12 5v14', 'M19 12l-7 7-7-7'],
  arrowUp: ['M12 19V5', 'M5 12l7-7 7 7'],
  briefcase: ['M9 6V4h6v2', 'M4 6h16v13H4z', 'M4 11h16', 'M10 11v2h4v-2'],
  calendar: ['M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2z', 'M8 2v4', 'M16 2v4', 'M3 9h18', 'M8 13h.01', 'M12 13h.01', 'M16 13h.01', 'M8 17h.01', 'M12 17h.01'],
  chat: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  check: ['M5 12.5l4 4L19 6.5'],
  edit: ['M12 20h9', 'M16.4 3.6a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  chevronDown: ['M6 9l6 6 6-6'],
  chevronLeft: ['M15 18l-6-6 6-6'],
  chevronRight: ['M9 18l6-6-6-6'],
  cloud: ['M17.5 19H8a5 5 0 1 1 1.1-9.9A6 6 0 0 1 20 12.5 3.5 3.5 0 0 1 17.5 19z'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  copy: ['M8 8h10v10H8z', 'M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'],
  document: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M8 13h8', 'M8 17h6'],
  folder: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8.5A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z'],
  folderPlus: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8.5A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z', 'M12 11v6', 'M9 14h6'],
  focus: ['M8 3H5a2 2 0 0 0-2 2v3', 'M16 3h3a2 2 0 0 1 2 2v3', 'M21 16v3a2 2 0 0 1-2 2h-3', 'M8 21H5a2 2 0 0 1-2-2v-3'],
  gripVertical: ['M9 5h.01', 'M9 12h.01', 'M9 19h.01', 'M15 5h.01', 'M15 12h.01', 'M15 19h.01'],
  history: ['M3 12a9 9 0 1 0 3-6.7', 'M3 4v5h5', 'M12 7v5l3 2'],
  home: ['M3 11.5 12 4l9 7.5', 'M5 10.5V20h5v-5h4v5h5v-9.5'],
  image: ['M4 5h16v14H4z', 'M4 15.5l4.5-4.5 3.5 3.5 3.5-3.5 4.5 4.5', 'M9.2 9.2h.01'],
  info: ['M12 17v-5', 'M12 8h.01', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'],
  library: ['M4 4h4v16H4z', 'M10 4h4v16h-4z', 'M16.5 5 20 4l2.5 15-3.5 1z', 'M5.5 8h1', 'M11.5 8h1'],
  link: ['M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1', 'M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1'],
  lock: ['M7 11V8a5 5 0 0 1 10 0v3', 'M6 11h12v9H6z'],
  moreHorizontal: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  panelLeft: ['M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z', 'M9 3v18'],
  panelRight: ['M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z', 'M15 3v18'],
  plus: ['M12 5v14', 'M5 12h14'],
  refresh: ['M21 12a9 9 0 0 1-15.4 6.4L3 16', 'M3 21v-5h5', 'M3 12a9 9 0 0 1 15.4-6.4L21 8', 'M21 3v5h-5'],
  save: ['M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z', 'M17 21v-8H7v8', 'M7 3v5h8'],
  search: ['M21 21l-4.3-4.3', 'M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4'],
  send: ['M22 2 11 13', 'M22 2l-7 20-4-9-9-4z'],
  settings: ['M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7', 'M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1a2 2 0 0 1 0 4H21a1.7 1.7 0 0 0-1.6 1'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10'],
  tag: ['M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V4h9l8.6 8.6a2 2 0 0 1 0 2.8z', 'M7.5 7.5h.01'],
  template: ['M4 4h16v16H4z', 'M4 9h16', 'M10 9v11'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6', 'M10 11v5', 'M14 11v5'],
  unlock: ['M7 11V8a5 5 0 0 1 8.8-3.2', 'M6 11h12v9H6z'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M22 21v-2a4 4 0 0 0-3-3.9', 'M16 3.1a4 4 0 0 1 0 7.8'],
};

type UiIconProps = SVGProps<SVGSVGElement> & {
  name: UiIconName;
};

export function UiIcon({ name, className, ...props }: UiIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="18"
      {...props}
    >
      {paths[name].map((d) => (
        <path d={d} key={d} />
      ))}
    </svg>
  );
}
