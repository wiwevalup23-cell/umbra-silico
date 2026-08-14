import type { SVGProps } from 'react'
import { iconPaths, type IconName } from './icon-paths'

export type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName
  size?: number | string
}

export function Icon({ name, size = 18, className, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      vectorEffect="non-scaling-stroke"
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      {iconPaths[name].map((d) => <path d={d} key={d} />)}
    </svg>
  )
}

export type { IconName }
