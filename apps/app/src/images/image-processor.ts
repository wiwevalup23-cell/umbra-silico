import type { ImageRenditionInfo } from '@/shared/contracts'

export type ProcessedRendition = {
  blob: Blob
  info: ImageRenditionInfo
}

export type ProcessedImage = {
  original: ProcessedRendition
  display: ProcessedRendition | null
  thumb: ProcessedRendition
  width: number
  height: number
}

export type ImageProcessorOptions = {
  maxBytes?: number
}

export interface ImageProcessor {
  process(file: Blob, options?: ImageProcessorOptions): Promise<ProcessedImage>
}

export class UnsupportedImageError extends Error {
  constructor(mimeType: string) {
    super(`Unsupported image type: ${mimeType || 'unknown'}.`)
    this.name = 'UnsupportedImageError'
  }
}

export class ImageTooLargeError extends Error {
  constructor(byteSize: number, maxBytes: number) {
    super(`Image is too large: ${byteSize} bytes (limit ${maxBytes}).`)
    this.name = 'ImageTooLargeError'
  }
}

const supportedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
])

const defaultMaxBytes = 25 * 1024 * 1024
const displayMaxEdge = 2048
const thumbMaxEdge = 320
const webpQuality = 0.82
const jpegQuality = 0.85

async function decodeBitmap(file: Blob): Promise<ImageBitmap> {
  try {
    // Bakes EXIF rotation into the pixels, so renditions are upright and
    // EXIF-free by construction.
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return createImageBitmap(file)
  }
}

function scaledSize(width: number, height: number, maxEdge: number) {
  const longEdge = Math.max(width, height)

  if (longEdge <= maxEdge) {
    return { width, height }
  }

  const factor = maxEdge / longEdge

  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
  }
}

type EncodeResult = {
  blob: Blob
  mimeType: string
}

async function encodeCanvas(
  bitmap: ImageBitmap,
  width: number,
  height: number,
): Promise<EncodeResult> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('Canvas 2D context is unavailable.')
    }

    context.drawImage(bitmap, 0, 0, width, height)

    const webp = await canvas.convertToBlob({ type: 'image/webp', quality: webpQuality })

    // Runtimes without a WebP encoder silently return PNG; fall back to JPEG
    // so renditions stay small.
    if (webp.type === 'image/webp') {
      return { blob: webp, mimeType: 'image/webp' }
    }

    const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality: jpegQuality })
    return { blob: jpeg, mimeType: jpeg.type || 'image/jpeg' }
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Canvas 2D context is unavailable.')
  }

  context.drawImage(bitmap, 0, 0, width, height)

  const toBlob = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, type, quality)
    })

  const webp = await toBlob('image/webp', webpQuality)

  if (webp && webp.type === 'image/webp') {
    return { blob: webp, mimeType: 'image/webp' }
  }

  const jpeg = await toBlob('image/jpeg', jpegQuality)

  if (!jpeg) {
    throw new Error('Canvas image encoding failed.')
  }

  return { blob: jpeg, mimeType: jpeg.type || 'image/jpeg' }
}

async function renderRendition(
  bitmap: ImageBitmap,
  maxEdge: number,
): Promise<ProcessedRendition> {
  const { width, height } = scaledSize(bitmap.width, bitmap.height, maxEdge)
  const encoded = await encodeCanvas(bitmap, width, height)

  return {
    blob: encoded.blob,
    info: {
      mimeType: encoded.mimeType,
      byteSize: encoded.blob.size,
      width,
      height,
    },
  }
}

class BrowserImageProcessor implements ImageProcessor {
  async process(file: Blob, options: ImageProcessorOptions = {}): Promise<ProcessedImage> {
    const maxBytes = options.maxBytes ?? defaultMaxBytes

    if (!supportedMimeTypes.has(file.type)) {
      throw new UnsupportedImageError(file.type)
    }

    if (file.size > maxBytes) {
      throw new ImageTooLargeError(file.size, maxBytes)
    }

    const bitmap = await decodeBitmap(file)

    try {
      const original: ProcessedRendition = {
        blob: file,
        info: {
          mimeType: file.type,
          byteSize: file.size,
          width: bitmap.width,
          height: bitmap.height,
        },
      }

      // Animated GIFs keep the original as the display source: a canvas
      // rendition would freeze the animation.
      const wantsDisplay =
        file.type !== 'image/gif' &&
        Math.max(bitmap.width, bitmap.height) > displayMaxEdge

      const display = wantsDisplay ? await renderRendition(bitmap, displayMaxEdge) : null
      const thumb = await renderRendition(bitmap, thumbMaxEdge)

      return {
        original,
        display,
        thumb,
        width: bitmap.width,
        height: bitmap.height,
      }
    } finally {
      bitmap.close()
    }
  }
}

export function createImageProcessor(): ImageProcessor {
  return new BrowserImageProcessor()
}
