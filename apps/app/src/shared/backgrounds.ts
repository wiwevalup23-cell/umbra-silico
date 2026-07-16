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

export const backgroundImageOptions = [
  {
    label: 'None',
    value: null,
  },
  ...backgroundImageFiles.map((fileName, index) => ({
    label: `Fon ${String(index + 1).padStart(2, '0')}`,
    value: `/assets/fons/${fileName}`,
  })),
] satisfies Array<{ label: string; value: string | null }>

export const allowedBackgroundImages = new Set(
  backgroundImageOptions
    .map((option) => option.value)
    .filter((value): value is string => value !== null),
)
