import { useEffect, useRef, useState } from 'react'
import type { ImageSourceResolver, NoteImageListItem } from '@/shared/contracts'
import { ImageSourceContext, useImageSource } from '@/ui/document'
import { UiIcon } from '@/ui/icons/ui/UiIcon'
import { useTranslation } from '@/ui/i18n/use-translation'

type NoteImageGalleryProps = {
  images: NoteImageListItem[]
  resolver: ImageSourceResolver | null
  onSelectImage: (imageId: string) => void
}

type GalleryThumbProps = {
  image: NoteImageListItem
  onSelect: (imageId: string) => void
}

function GalleryThumb({ image, onSelect }: GalleryThumbProps) {
  const { t } = useTranslation()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [isVisible, setVisible] = useState(
    () => typeof IntersectionObserver === 'undefined',
  )
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

  // Held back until the thumbnail scrolls into view, so a long gallery does
  // not decode every image at once.
  const thumb = useImageSource(isVisible ? image.id : null, 'thumb')

  return (
    <button
      aria-label={t('gallery.showImageInNote')}
      className="sn-note-gallery__thumb"
      onClick={() => onSelect(image.id)}
      ref={buttonRef}
      title={t('gallery.showInNote')}
      type="button"
    >
      {thumb.status === 'ready' ? (
        <img alt="" loading="lazy" src={thumb.url} />
      ) : (
        <span
          className={
            thumb.status === 'error'
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
    // The gallery is handed the resolver as a prop while the editor and the
    // chat feed read it from context; providing it here lets every thumbnail
    // use the same hook, and the pairing of request and release with it.
    <ImageSourceContext.Provider value={resolver}>
      <div aria-label="Note photos" className="sn-note-gallery">
        <div className="sn-note-gallery__grid">
          {images.map((image) => (
            <GalleryThumb image={image} key={image.id} onSelect={onSelectImage} />
          ))}
        </div>
      </div>
    </ImageSourceContext.Provider>
  )
}
