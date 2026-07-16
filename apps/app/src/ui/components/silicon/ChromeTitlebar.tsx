import type { ReactNode } from 'react'
import { PixelIcon } from '@/ui/components/silicon/PixelIcon'

type ChromeTitlebarProps = {
  actions?: ReactNode
  leading?: ReactNode
  subtitle?: string
  title: string
}

export function ChromeTitlebar({ actions, leading, subtitle, title }: ChromeTitlebarProps) {
  return (
    <div className="sn-titlebar">
      <div className="sn-titlebar-identity">
        <div className="sn-titlebar-leading">{leading ?? <PixelIcon name="note" />}</div>
        <div className="sn-titlebar-copy">
          <h1 className="sn-titlebar-logo">{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="sn-titlebar-actions">{actions}</div> : null}
    </div>
  )
}
