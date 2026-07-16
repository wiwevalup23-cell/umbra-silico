import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'

type RetroButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    pressed?: boolean
    size?: 'sm' | 'md' | 'lg'
    variant?: 'default' | 'primary' | 'danger' | 'ghost' | 'editor'
  }
>

export function RetroButton({
  children,
  className,
  pressed = false,
  size = 'md',
  type,
  variant = 'default',
  ...props
}: RetroButtonProps) {
  const classes = [
    'sn-button',
    `sn-button--${variant}`,
    `sn-button--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      aria-pressed={pressed || undefined}
      className={classes}
      data-pressed={pressed}
      type={type ?? 'button'}
      {...props}
    >
      {children}
    </button>
  )
}
