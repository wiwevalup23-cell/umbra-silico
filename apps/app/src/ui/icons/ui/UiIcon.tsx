import { Icon, type IconName, type IconProps } from '@/ui/icons/umbra'

export type UiIconName = IconName
export type UiIconProps = IconProps

/**
 * Compatibility adapter for older call sites. New code should import `Icon`
 * from `@/ui/icons/umbra`; keeping this wrapper lets the 24 px Umbra family
 * reach existing screens without a risky all-at-once component migration.
 */
export function UiIcon(props: UiIconProps) {
  return <Icon {...props} />
}
