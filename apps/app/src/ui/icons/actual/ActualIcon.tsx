import type { CSSProperties, HTMLAttributes } from 'react'
import documentTextSvg from './assets/document-text.svg?raw'
import lockSvg from './assets/lock.svg?raw'
import pinSvg from './assets/pin.svg?raw'
import unlockSvg from './assets/unlock.svg?raw'

const actualIconSvg = {
  documentText: documentTextSvg,
  lock: lockSvg,
  pin: pinSvg,
  unlock: unlockSvg,
} as const

export type ActualIconKey = keyof typeof actualIconSvg

type ActualIconProps = HTMLAttributes<HTMLSpanElement> & {
  name: ActualIconKey
  size?: number
}

export function ActualIcon({
  className,
  name,
  size = 18,
  style,
  ...props
}: ActualIconProps) {
  return (
    <span
      aria-hidden="true"
      className={['sn-actual-icon', className].filter(Boolean).join(' ')}
      dangerouslySetInnerHTML={{ __html: actualIconSvg[name] }}
      style={
        {
          '--sn-icon-size': `${size}px`,
          ...style,
        } as CSSProperties
      }
      {...props}
    />
  )
}
