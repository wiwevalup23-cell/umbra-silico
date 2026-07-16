import type { CSSProperties, HTMLAttributes } from 'react'
import burstStarSvg from './assets/burst-star.svg?raw'
import noteWindowSvg from './assets/note-window.svg?raw'
import signalSpeakerSvg from './assets/signal-speaker.svg?raw'
import switchArrowsSvg from './assets/switch-arrows.svg?raw'

const y2kIconSvg = {
  burstStar: burstStarSvg,
  noteWindow: noteWindowSvg,
  signalSpeaker: signalSpeakerSvg,
  switchArrows: switchArrowsSvg,
} as const

export type Y2KIconKey = keyof typeof y2kIconSvg

type Y2KIconProps = HTMLAttributes<HTMLSpanElement> & {
  name: Y2KIconKey
  size?: number
}

export function Y2KIcon({
  className,
  name,
  size = 18,
  style,
  ...props
}: Y2KIconProps) {
  return (
    <span
      aria-hidden="true"
      className={['sn-y2k-icon', className].filter(Boolean).join(' ')}
      dangerouslySetInnerHTML={{ __html: y2kIconSvg[name] }}
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
