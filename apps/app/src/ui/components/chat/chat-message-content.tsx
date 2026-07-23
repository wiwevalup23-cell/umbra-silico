import {
  Fragment,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import katex from 'katex'
import {
  imageBlockNodeName,
  imageIdSchema,
  type ChatMessageContent,
  type DocumentNode,
  type ImageId,
  type TextMark,
  type TextNode,
} from '@/shared/contracts'
import { ImageSourceContext } from '@/ui/editor/image-source-context'
import { editorFontOptions, editorTextSizeOptions } from '@/ui/editor/rich-text'
import { UiIcon } from '@/ui/icons/ui/UiIcon'

// Static renderer for message bubbles. The feed deliberately renders plain
// React (not a TipTap instance) so a long chat stays a cheap list; only the
// composer is a live editor.

const supportedFontFamilies = new Set(
  editorFontOptions.map((option) => option.value).filter(Boolean),
)
const supportedFontSizes = new Set(
  editorTextSizeOptions.map((option) => option.value).filter(Boolean),
)

function readHighlightColor(value: unknown): string | undefined {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : undefined
}

function readTextStyle(attrs: TextMark['attrs']): CSSProperties {
  const fontFamily = attrs?.fontFamily
  const fontSize = attrs?.fontSize

  return {
    fontFamily:
      typeof fontFamily === 'string' && supportedFontFamilies.has(fontFamily)
        ? fontFamily
        : undefined,
    fontSize:
      typeof fontSize === 'string' && supportedFontSizes.has(fontSize)
        ? fontSize
        : undefined,
  }
}

function renderTextNode(node: TextNode, key: number): ReactNode {
  let rendered: ReactNode = node.text

  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case 'bold':
        rendered = <strong>{rendered}</strong>
        break
      case 'italic':
        rendered = <em>{rendered}</em>
        break
      case 'strike':
        rendered = <s>{rendered}</s>
        break
      case 'underline':
        rendered = <u>{rendered}</u>
        break
      case 'code':
        rendered = <code>{rendered}</code>
        break
      case 'highlight':
        rendered = (
          <mark style={{ backgroundColor: readHighlightColor(mark.attrs?.color) }}>
            {rendered}
          </mark>
        )
        break
      case 'textStyle':
        rendered = <span style={readTextStyle(mark.attrs)}>{rendered}</span>
        break
      case 'link': {
        const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : null
        rendered = href ? (
          <a href={href} rel="noreferrer noopener" target="_blank">
            {rendered}
          </a>
        ) : (
          rendered
        )
        break
      }
      default:
        break
    }
  }

  return <Fragment key={key}>{rendered}</Fragment>
}

function ChatMath({ kind, latex }: { kind: MathKind; latex: string }) {
  const mathRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!mathRef.current) {
      return
    }

    katex.render(latex, mathRef.current, {
      displayMode: kind === 'block',
      output: 'htmlAndMathml',
      strict: 'warn',
      throwOnError: false,
    })
  }, [kind, latex])

  const commonProps = {
    'aria-label': `Equation: ${latex}`,
    className: `sn-chat-message__math sn-chat-message__math--${kind}`,
  }

  return <span {...commonProps} ref={mathRef} />
}

type MathKind = 'inline' | 'block'

function renderChildren(node: DocumentNode): ReactNode {
  return (node.content ?? []).map((child, index) =>
    child.type === 'text'
      ? renderTextNode(child as TextNode, index)
      : renderBlockNode(child as DocumentNode, index),
  )
}

function renderBlockNode(node: DocumentNode, key: number): ReactNode {
  switch (node.type) {
    case 'paragraph':
      return <p key={key}>{renderChildren(node)}</p>
    case 'hardBreak':
      return <br key={key} />
    case 'inlineMath':
      return (
        <ChatMath
          key={key}
          kind="inline"
          latex={typeof node.attrs?.latex === 'string' ? node.attrs.latex : ''}
        />
      )
    case 'blockMath':
      return (
        <ChatMath
          key={key}
          kind="block"
          latex={typeof node.attrs?.latex === 'string' ? node.attrs.latex : ''}
        />
      )
    case 'heading':
      return (
        <p className="sn-chat-message__heading" key={key}>
          {renderChildren(node)}
        </p>
      )
    case 'bulletList':
      return <ul key={key}>{renderChildren(node)}</ul>
    case 'orderedList': {
      const start = typeof node.attrs?.start === 'number' ? node.attrs.start : undefined
      return (
        <ol key={key} start={start}>
          {renderChildren(node)}
        </ol>
      )
    }
    case 'listItem':
      return <li key={key}>{renderChildren(node)}</li>
    case 'taskList':
      return (
        <ul className="sn-chat-message__tasks" key={key}>
          {renderChildren(node)}
        </ul>
      )
    case 'taskItem': {
      const checked = node.attrs?.checked === true
      return (
        <li data-checked={checked} key={key}>
          <input checked={checked} disabled readOnly type="checkbox" />
          <span>{renderChildren(node)}</span>
        </li>
      )
    }
    case 'codeBlock':
      return (
        <pre key={key}>
          <code>{renderChildren(node)}</code>
        </pre>
      )
    case 'blockquote':
      return <blockquote key={key}>{renderChildren(node)}</blockquote>
    case 'callout':
      return (
        <div className="sn-chat-message__callout" key={key}>
          {renderChildren(node)}
        </div>
      )
    case imageBlockNodeName:
      return <ChatImageBlock key={key} node={node} />
    default:
      // Unknown containers (toggles, tables, future blocks) degrade to their
      // readable children instead of hiding the message.
      return <Fragment key={key}>{renderChildren(node)}</Fragment>
  }
}

export function ChatMessageContentView({ content }: { content: ChatMessageContent }) {
  return (
    <div className="sn-chat-message__content">
      {content.map((node, index) =>
        node.type === 'text'
          ? renderTextNode(node as TextNode, index)
          : renderBlockNode(node as DocumentNode, index),
      )}
    </div>
  )
}

type ResolveState =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'error' }

function useChatImageUrl(imageId: ImageId | null): ResolveState {
  const resolver = useContext(ImageSourceContext)
  const [state, setState] = useState<ResolveState>({ status: 'loading' })

  useEffect(() => {
    if (!imageId || !resolver) {
      setState({ status: 'error' })
      return
    }

    let alive = true
    setState({ status: 'loading' })

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

function ChatImageBlock({ node }: { node: DocumentNode }) {
  const parsedImageId = imageIdSchema.safeParse(node.attrs?.imageId)
  const imageId = parsedImageId.success ? parsedImageId.data : null
  const resolveState = useChatImageUrl(imageId)
  const [isLightboxOpen, setLightboxOpen] = useState(false)
  const naturalWidth = typeof node.attrs?.naturalWidth === 'number' ? node.attrs.naturalWidth : null
  const naturalHeight =
    typeof node.attrs?.naturalHeight === 'number' ? node.attrs.naturalHeight : null
  const ratioStyle: CSSProperties =
    naturalWidth && naturalHeight
      ? { aspectRatio: `${naturalWidth} / ${naturalHeight}` }
      : { minHeight: '96px' }
  const caption = typeof node.attrs?.caption === 'string' ? node.attrs.caption : ''
  const altText = caption || 'Chat image'

  useEffect(() => {
    if (!isLightboxOpen) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setLightboxOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [isLightboxOpen])

  return (
    <figure className="sn-chat-message__image" data-image-id={imageId ?? undefined}>
      {resolveState.status === 'ready' ? (
        <img
          alt={altText}
          draggable={false}
          onClick={() => setLightboxOpen(true)}
          src={resolveState.url}
          style={ratioStyle}
        />
      ) : resolveState.status === 'loading' ? (
        <div
          aria-label="Loading image"
          className="sn-chat-message__image-placeholder"
          role="status"
          style={ratioStyle}
        />
      ) : (
        <div className="sn-chat-message__image-error" style={ratioStyle}>
          <UiIcon name="info" />
          <span>Image unavailable</span>
        </div>
      )}
      {caption ? <figcaption>{caption}</figcaption> : null}

      {isLightboxOpen && resolveState.status === 'ready'
        ? createPortal(
            <div
              aria-label="Image preview"
              className="sn-image-lightbox"
              onClick={() => setLightboxOpen(false)}
              role="dialog"
            >
              <button
                aria-label="Close image preview"
                className="sn-image-lightbox__close"
                onClick={() => setLightboxOpen(false)}
                type="button"
              >
                <UiIcon name="close" />
              </button>
              <img
                alt={altText}
                className="sn-image-lightbox__img"
                onClick={(event) => event.stopPropagation()}
                src={resolveState.url}
              />
              {caption ? <p className="sn-image-lightbox__caption">{caption}</p> : null}
            </div>,
            document.body,
          )
        : null}
    </figure>
  )
}
