import type { ElementType, HTMLAttributes, PropsWithChildren } from 'react'

type GlassPanelProps<TElement extends ElementType> = PropsWithChildren<
  HTMLAttributes<HTMLElement> & {
    as?: TElement
    tone?: 'default' | 'inset'
  }
>

export function GlassPanel<TElement extends ElementType = 'div'>({
  as,
  children,
  className,
  tone = 'default',
  ...props
}: GlassPanelProps<TElement>) {
  const Component = as ?? 'div'
  const classes = ['sn-panel', `sn-panel--${tone}`, className]
    .filter(Boolean)
    .join(' ')

  return (
    <Component className={classes} {...props}>
      {children}
    </Component>
  )
}
