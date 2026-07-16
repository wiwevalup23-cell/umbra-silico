import { NotionIcon, type NotionIconKey } from '@/ui/icons/notion'

export type PixelIconName =
  | 'close'
  | 'home'
  | 'lock'
  | 'maximize'
  | 'minimize'
  | 'new-note'
  | 'note'
  | 'pin'
  | 'search'
  | 'settings'
  | 'spark'
  | 'status'
  | 'sync'
  | 'unlock'

type PixelIconProps = {
  name: PixelIconName
  size?: number
}

const iconSources: Record<PixelIconName, NotionIconKey> = {
  close: 'x',
  home: 'home',
  lock: 'lock',
  maximize: 'browser',
  minimize: 'minus',
  'new-note': 'plus',
  note: 'documentText',
  pin: 'pin',
  search: 'browser',
  settings: 'info',
  spark: 'spark',
  status: 'status',
  sync: 'sync',
  unlock: 'unlock',
}

export function PixelIcon({ name, size = 18 }: PixelIconProps) {
  const iconSource = iconSources[name]

  return <NotionIcon name={iconSource} size={size} />
}
