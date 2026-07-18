import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import {
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { imageIdSchema, type ImageId } from '@/shared/contracts'
import { ImageSourceContext } from '@/ui/editor/image-source-context'
import { UiIcon } from '@/ui/icons/ui/UiIcon'
import {
  normalizeImageAlign,
  normalizeImageWidthPct,
  type ImageAlign,
  type ImageBlockAttrs,
} from './image-block'

type ResolveState =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'error' }

const alignOptions: Array<{ align: ImageAlign; label: string }> = [
  { align: 'left', label: 'Align left' },
  { align: 'center', label: 'Align center' },
  { align: 'right', label: 'Align right' },
  { align: 'full', label: 'Full width' },
]

function useImageObjectUrl(imageId: ImageId | null): ResolveState {
  const resolver = useContext(ImageSourceContext)
  const [state, setState] = useState<ResolveState>({ status: 'loading' })

  useEffect(() => {
    if (!imageId || !resolver) {
      setState({ status: 'error' })
      return
    }

    let alive = true
    setState({ status: 'loading' })

    // The editor always renders the display tier; the repository falls back
    // to the original when no display rendition exists (small images, GIFs).
    resolver
      .request(imageId, 'display')
      .then((url) => {
        if (alive) {
          setState({ status: 'ready', url })
        }
      })
      .catch(() => {
        if (alive) {
          setState({ status: 'error' })
        }
      })

    return () => {
      alive = false
      resolver.release(imageId, 'display')
    }
  }, [imageId, resolver])

  return state
}

type ImageLightboxProps = {
  alt: string
  caption: string
  onClose: () => void
  url: string
}

function ImageLightbox({ alt, caption, onClose, url }: ImageLightboxProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose])

  return createPortal(
    <div
      aria-label="Image preview"
      className="sn-image-lightbox"
      onClick={onClose}
      role="dialog"
    >
      <button
        aria-label="Close image preview"
        className="sn-image-lightbox__close"
        onClick={onClose}
        type="button"
      >
        <UiIcon name="close" />
      </button>
      <img
        alt={alt}
        className="sn-image-lightbox__img"
        onClick={(event) => event.stopPropagation()}
        src={url}
      />
      {caption ? <p className="sn-image-lightbox__caption">{caption}</p> : null}
    </div>,
    document.body,
  )
}

export function ImageBlockView({
  editor,
  node,
  selected,
  deleteNode,
  updateAttributes,
}: NodeViewProps) {
  const attrs = node.attrs as ImageBlockAttrs
  const parsedImageId = imageIdSchema.safeParse(attrs.imageId)
  const imageId = parsedImageId.success ? parsedImageId.data : null
  const resolveState = useImageObjectUrl(imageId)
  const align = normalizeImageAlign(attrs.align)
  const widthPct = normalizeImageWidthPct(attrs.widthPct)
  const [captionDraft, setCaptionDraft] = useState(attrs.caption)
  const [isLightboxOpen, setLightboxOpen] = useState(false)
  const [isFlashing, setFlashing] = useState(false)
  const [dragWidthPct, setDragWidthPct] = useState<number | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const isEditable = editor.isEditable

  useEffect(() => {
    setCaptionDraft(attrs.caption)
  }, [attrs.caption])

  useEffect(() => {
    // The gallery's "reveal" broadcasts this event; state (not classList)
    // drives the highlight so the node view's re-renders can't wipe it.
    const targetImageId = attrs.imageId
    let timeout = 0

    function handleFlash(event: Event) {
      const detail = (event as CustomEvent<{ imageId?: string }>).detail

      if (detail?.imageId !== targetImageId) {
        return
      }

      setFlashing(true)
      window.clearTimeout(timeout)
      timeout = window.setTimeout(() => setFlashing(false), 1300)
    }

    document.addEventListener('sn-image-flash', handleFlash)

    return () => {
      window.clearTimeout(timeout)
      document.removeEventListener('sn-image-flash', handleFlash)
    }
  }, [attrs.imageId])

  function commitCaption() {
    if (captionDraft !== attrs.caption) {
      updateAttributes({ caption: captionDraft })
    }
  }

  function beginResize(event: ReactPointerEvent<HTMLSpanElement>, direction: 1 | -1) {
    if (!isEditable) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const frame = frameRef.current
    const column = frame?.parentElement?.parentElement

    if (!frame || !column) {
      return
    }

    const columnWidth = column.getBoundingClientRect().width || 1
    const startX = event.clientX
    const startPct = dragWidthPct ?? widthPct
    let nextPct = startPct

    function handleMove(moveEvent: globalThis.PointerEvent) {
      const deltaPx = (moveEvent.clientX - startX) * direction
      nextPct = normalizeImageWidthPct(startPct + (deltaPx / columnWidth) * 100)
      setDragWidthPct(nextPct)
    }

    function handleUp() {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      setDragWidthPct(null)

      // One history step per resize gesture: attrs update only on release.
      if (nextPct !== startPct) {
        updateAttributes({ widthPct: nextPct })
      }
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  const effectiveWidthPct = dragWidthPct ?? widthPct
  const figureStyle: CSSProperties = {
    width: align === 'full' ? '100%' : `${effectiveWidthPct}%`,
  }
  const ratioStyle: CSSProperties =
    attrs.naturalWidth && attrs.naturalHeight
      ? { aspectRatio: `${attrs.naturalWidth} / ${attrs.naturalHeight}` }
      : { minHeight: '96px' }
  const altText = attrs.caption || 'Note image'

  return (
    <NodeViewWrapper
      as="figure"
      className={[
        'sn-image-block',
        `sn-image-block--align-${align}`,
        selected ? 'sn-image-block--selected' : '',
        isFlashing ? 'sn-image-block--flash' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-image-id={attrs.imageId}
      style={figureStyle}
    >
      <div className="sn-image-block__frame" ref={frameRef}>
        {resolveState.status === 'ready' ? (
          <img
            alt={altText}
            className="sn-image-block__img"
            draggable={false}
            onClick={() => setLightboxOpen(true)}
            src={resolveState.url}
            style={ratioStyle}
          />
        ) : resolveState.status === 'loading' ? (
          <div
            aria-label="Loading image"
            className="sn-image-block__placeholder"
            role="status"
            style={ratioStyle}
          />
        ) : (
          <div className="sn-image-block__error" style={ratioStyle}>
            <UiIcon name="info" />
            <span>Image unavailable</span>
          </div>
        )}

        {selected && isEditable ? (
          <div className="sn-image-block__toolbar" aria-label="Image options">
            {alignOptions.map((option) => (
              <button
                aria-label={option.label}
                data-active={align === option.align}
                key={option.align}
                onClick={() => updateAttributes({ align: option.align })}
                title={option.label}
                type="button"
              >
                {option.align === 'full' ? (
                  <UiIcon name="focus" />
                ) : (
                  <span
                    aria-hidden="true"
                    className={`sn-image-block__align-glyph sn-image-block__align-glyph--${option.align}`}
                  />
                )}
              </button>
            ))}
            <button
              aria-label="Delete image"
              onClick={() => deleteNode()}
              title="Delete image"
              type="button"
            >
              <UiIcon name="trash" />
            </button>
          </div>
        ) : null}

        {selected && isEditable && align !== 'full' ? (
          <>
            <span
              aria-hidden="true"
              className="sn-image-block__resize-handle sn-image-block__resize-handle--left"
              onPointerDown={(event) => beginResize(event, -1)}
            />
            <span
              aria-hidden="true"
              className="sn-image-block__resize-handle sn-image-block__resize-handle--right"
              onPointerDown={(event) => beginResize(event, 1)}
            />
          </>
        ) : null}
      </div>

      {isEditable ? (
        <input
          aria-label="Image caption"
          className="sn-image-block__caption"
          onBlur={commitCaption}
          onChange={(event) => setCaptionDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commitCaption()
              event.currentTarget.blur()
            }
          }}
          placeholder="Add a caption…"
          value={captionDraft}
        />
      ) : attrs.caption ? (
        <figcaption className="sn-image-block__caption sn-image-block__caption--static">
          {attrs.caption}
        </figcaption>
      ) : null}

      {isLightboxOpen && resolveState.status === 'ready' ? (
        <ImageLightbox
          alt={altText}
          caption={attrs.caption}
          onClose={() => setLightboxOpen(false)}
          url={resolveState.url}
        />
      ) : null}
    </NodeViewWrapper>
  )
}
