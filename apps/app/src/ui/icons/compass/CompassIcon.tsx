import type { SVGProps } from 'react'
import {
  compassCoreStatusIcons,
  compassCustomStatusIcons,
  compassFormatIcons,
} from '@/ui/icons/compass/compass-icon-paths'

const compassIconPaths = {
  ...compassFormatIcons,
  ...compassCoreStatusIcons,
  ...compassCustomStatusIcons,
}

export type CompassIconName = keyof typeof compassIconPaths

type CompassIconProps = SVGProps<SVGSVGElement> & {
  name: CompassIconName
}

export function CompassIcon({ name, className, ...props }: CompassIconProps) {
  const { d, f } = compassIconPaths[name]

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      height="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.45"
      viewBox="0 0 20 20"
      width="20"
      {...props}
    >
      <path d={d} />
      {f ? <path d={f} fill="currentColor" stroke="none" /> : null}
    </svg>
  )
}
