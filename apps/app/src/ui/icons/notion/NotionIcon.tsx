import type { CSSProperties, SVGProps } from 'react'
import {
  notionIconPaths,
  type NotionIconKey,
} from '@/ui/icons/notion/notion-icon-paths'

export type NotionIconProps = SVGProps<SVGSVGElement> & {
  name: NotionIconKey
  size?: number
}

export function NotionIcon({
  className,
  name,
  size = 18,
  style,
  ...props
}: NotionIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={['sn-notion-icon', className].filter(Boolean).join(' ')}
      fill="none"
      height={size}
      style={
        {
          '--sn-icon-size': `${size}px`,
          ...style,
        } as CSSProperties
      }
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {notionIconPaths[name].map((path, index) => (
        <path
          d={path.d}
          fill="none"
          key={`${name}-${index}`}
          stroke="currentColor"
          strokeLinecap="round"
        />
      ))}
    </svg>
  )
}
