import { useEffect, useRef, useState } from 'react'
import type { ImageSourceResolver, NoteImageListItem } from '@/shared/contracts'
import { UiIcon } from '@/ui/icons/ui/UiIcon'
import { useTranslation } from '@/ui/i18n/use-translation'

type NoteImageGalleryProps = {
  images: NoteImageListItem[]
  resolver: ImageSourceResolver | null
  onSelectImage: (imageId: string) => void
}

type GalleryThumbProps = {
  image: NoteImageListItem
  resolver: ImageSourceResolver | null
  onSelect: (imageId: string) => void
}

function GalleryThumb({ image, resolver, onSelect }: GalleryThumbProps) {
  const { t } = useTranslation()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [isVisible, setVisible] = useState(
    () => typeof IntersectionObserver === 'undefined',
  )
  const [url, setUrl] = useState<string | null>(null)
  const [hasError, setError] = useState(false)

  useEffect(() => {
    const button = buttonRef.current

    if (isVisible || !button || typeof IntersectionObserver === 'undefined') {
      return
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true)
      }
    })

    observer.observe(button)
    return () => observer.disconnect()
  }, [isVisible])

  useEffect(() => {
    if (!isVisible || !resolver) {
      return
    }

    let alive = true
    const imageId = image.id

    resolver
      .request(imageId, 'thumb')
      .then((nextUrl) => {
        if (alive) {
          setUrl(nextUrl)
        }
      })
      .catch(() => {
        if (alive) {
          setError(true)
        }
      })

    return () => {
      alive = false
      resolver.release(imageId, 'thumb')
    }
  }, [image.id, isVisible, resolver])

  return (
    <button
      aria-label={t('gallery.showImageInNote')}
      className="sn-note-gallery__thumb"
      onClick={() => onSelect(image.id)}
      ref={buttonRef}
      title={t('gallery.showInNote')}
      type="button"
    >
      {url ? (
        <img alt="" loading="lazy" src={url} />
      ) : (
        <span
          className={
            hasError
              ? 'sn-note-gallery__thumb-error'
              : 'sn-note-gallery__thumb-loading'
          }
        >
          <UiIcon name="image" />
        </span>
      )}
    </button>
  )
}

export function NoteImageGallery({
  images,
  resolver,
  onSelectImage,
}: NoteImageGalleryProps) {
  const { t } = useTranslation()
  if (images.length === 0) {
    return (
      <div className="sn-note-gallery__empty">
        <UiIcon name="image" />
        <strong>{t('gallery.empty')}</strong>
        <p>{t('gallery.emptyHint')}</p>
      </div>
    )
  }

  return (
    <div aria-label="Note photos" className="sn-note-gallery">
      <div className="sn-note-gallery__grid">
        {images.map((image) => (
          <GalleryThumb
            image={image}
            key={image.id}
            onSelect={onSelectImage}
            resolver={resolver}
          />
        ))}
      </div>
    </div>
  )
}
