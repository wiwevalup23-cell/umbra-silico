import type { ButtonHTMLAttributes } from 'react'
import { Icon, type IconName } from '@/ui/icons/umbra'
import { LegacyUiIcon, type LegacyUiIconName } from '@/ui/icons/ui/LegacyUiIcon'

export type SquircleButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  active?: boolean
  icon?: IconName
  legacyIcon?: LegacyUiIconName
  size?: 'small' | 'compact' | 'large'
  /** A short label drawn below the button on hover and keyboard focus. */
  tooltip?: string
  variant?: 'quiet' | 'primary' | 'inverted'
}

/**
 * The global action: the design system's `.sn-squircle`. One form in three
 * sizes — 44 in the app header (`large`), 36 in panel headers and on window
 * close (`compact`), 32 on the sheet (`small`). The superellipse and its 1px
 * ring are drawn by design-system.css on the button's own pseudo-elements, so
 * the only children are the icon and an optional tooltip.
 */
const sizeClass: Record<NonNullable<SquircleButtonProps['size']>, string> = {
  large: '',
  compact: 'sn-squircle--36',
  small: 'sn-squircle--32',
}

const variantClass: Record<NonNullable<SquircleButtonProps['variant']>, string> = {
  quiet: '',
  primary: 'sn-squircle--primary',
  inverted: 'sn-squircle--inverse',
}

export function SquircleButton({
  active = false,
  className = '',
  icon,
  legacyIcon,
  size = 'compact',
  tooltip,
  variant = 'quiet',
  ...props
}: SquircleButtonProps) {
  const iconClass = size === 'small' ? 'sn-icon sn-icon--16' : 'sn-icon'
  const classes = [
    'sn-icon-button sn-squircle-button sn-squircle',
    sizeClass[size],
    variantClass[variant],
    active ? 'is-on' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      className={classes}
      data-active={active || undefined}
      data-size={size}
      data-variant={variant}
      type="button"
      {...props}
    >
      {legacyIcon ? (
        <LegacyUiIcon className={`sn-squircle-button__icon ${iconClass}`} name={legacyIcon} />
      ) : icon ? (
        <Icon className={`sn-squircle-button__icon ${iconClass}`} name={icon} />
      ) : null}
      {tooltip ? (
        <span aria-hidden="true" className="sn-squircle__tooltip">
          {tooltip}
        </span>
      ) : null}
    </button>
  )
}
