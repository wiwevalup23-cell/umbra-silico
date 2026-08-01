import { publicAsset } from '@/shared/public-asset'

export type BackgroundPattern = 'grid' | 'scanlines' | 'none'

export const backgroundPatternOptions: Array<{ label: string; value: BackgroundPattern }> = [
  { label: 'Grid · graph paper', value: 'grid' },
  { label: 'Scanlines · old screen', value: 'scanlines' },
  { label: 'Flat · no pattern', value: 'none' },
]

export const allowedBackgroundPatterns = new Set<BackgroundPattern>(
  backgroundPatternOptions.map((option) => option.value),
)

export const backgroundImageFiles = [
  '42370b16dc83b7cc813f2af68ef9ebca.webp',
  '57193110209ccde092dd7e46cb5b5ce7.jpg',
  '58235f91657283da3185805d0cf6a7ae.webp',
  '5e9cd5cf033e14f5c88f58c78942145e.jpg',
  '791e61f40268cb9477ebc9ab0a2d277b.jpg',
  '935ba15109b3511b1c22d4ed280361a5.jpg',
  'a48efd488a4b13953021c279cd6c8966.webp',
  'b3d3f5849bca9742b21302200ccbc354.webp',
  'canvas.png',
  'canvas1.png',
  'cc3c30c420005c7422c16e55a2555917.jpg',
  'd3521815c2887fb0783efed667545e22.webp',
  'dae8ba8cc1c7d0ae3aef70c01db5cc13.jpg',
] as const

export const backgroundEffectFiles = [
  publicAsset('assets/effects/colorful/1.jpg'),
  publicAsset('assets/effects/colorful/2.jpg'),
  publicAsset('assets/effects/colorful/3.jpg'),
  publicAsset('assets/effects/colorful/4.jpg'),
  publicAsset('assets/effects/mono/1.jpg'),
  publicAsset('assets/effects/mono/2.jpg'),
  publicAsset('assets/effects/mono/3.jpg'),
  publicAsset('assets/effects/mono/4.jpg'),
] as const

export const backgroundImageOptions = [
  {
    label: 'None · clean grid',
    value: null,
  },
  { label: 'Rose mineral', value: publicAsset(`assets/fons/${backgroundImageFiles[0]}`) },
  { label: 'Sand contour', value: publicAsset(`assets/fons/${backgroundImageFiles[1]}`) },
  { label: 'Pressed botanicals', value: publicAsset(`assets/fons/${backgroundImageFiles[2]}`) },
  { label: 'Umber cloud', value: publicAsset(`assets/fons/${backgroundImageFiles[3]}`) },
  { label: 'Copper petals', value: publicAsset(`assets/fons/${backgroundImageFiles[4]}`) },
  { label: 'Burnished paper', value: publicAsset(`assets/fons/${backgroundImageFiles[5]}`) },
  { label: 'Soft focus', value: publicAsset(`assets/fons/${backgroundImageFiles[6]}`) },
  { label: 'Warped checker', value: publicAsset(`assets/fons/${backgroundImageFiles[7]}`) },
  { label: 'Signal field', value: publicAsset(`assets/fons/${backgroundImageFiles[8]}`) },
  { label: 'Signal cross', value: publicAsset(`assets/fons/${backgroundImageFiles[9]}`) },
  { label: 'Amber current', value: publicAsset(`assets/fons/${backgroundImageFiles[10]}`) },
  { label: 'Copper veil', value: publicAsset(`assets/fons/${backgroundImageFiles[11]}`) },
  { label: 'Solar bloom', value: publicAsset(`assets/fons/${backgroundImageFiles[12]}`) },
  { label: 'Ripple weave · azure', value: backgroundEffectFiles[0] },
  { label: 'Halftone dots · crimson', value: backgroundEffectFiles[1] },
  { label: 'Triangle static · neon', value: backgroundEffectFiles[2] },
  { label: 'Ripple weave · verdant', value: backgroundEffectFiles[3] },
  { label: 'Ripple weave · mono', value: backgroundEffectFiles[4] },
  { label: 'Halftone dots · mono', value: backgroundEffectFiles[5] },
  { label: 'Triangle static · mono', value: backgroundEffectFiles[6] },
  { label: 'Ripple weave · concentric', value: backgroundEffectFiles[7] },
] satisfies Array<{ label: string; value: string | null }>

/**
 * Marks "use the image the user uploaded" rather than a bundled asset.
 *
 * The image itself is far too large for the settings blob in `localStorage`,
 * so settings store this sentinel and the picture lives in IndexedDB.
 */
export const customBackgroundValue = 'custom'

/** Large enough for a desktop wallpaper, small enough to stay responsive. */
export const customBackgroundMaxBytes = 20 * 1024 * 1024

export const supportedBackgroundMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
] as const

/**
 * Why a code and not a sentence: the store that raises it has no translator,
 * and the message has to render in whichever locale the user picked.
 */
export type CustomBackgroundErrorCode = 'unsupported' | 'tooLarge' | 'failed'

export const allowedBackgroundImages = new Set([
  customBackgroundValue,
  ...backgroundImageOptions
    .map((option) => option.value)
    .filter((value): value is string => value !== null),
])
