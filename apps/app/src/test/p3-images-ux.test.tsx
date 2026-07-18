import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createDraftLocalNote,
  deviceIdSchema,
  documentV1Contract,
  noteIdSchema,
  userIdSchema,
  type ImageSourceResolver,
} from '@/shared/contracts'
import { EditorShell, type EditorShellApi } from '@/ui/components/notes/EditorShell'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const cleanupTasks: Array<() => void> = []
const userId = userIdSchema.parse('images_ux_user')
const deviceId = deviceIdSchema.parse('images_ux_device')
const noteId = noteIdSchema.parse('note_images_ux')
const now = '2026-07-18T00:00:00.000Z'

afterEach(() => {
  while (cleanupTasks.length > 0) {
    cleanupTasks.pop()?.()
  }
  vi.restoreAllMocks()
})

function makeNote() {
  return createDraftLocalNote({
    document: {
      ...documentV1Contract.createEmpty(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Photo journal.' }],
          },
        ],
      },
    },
    deviceId,
    id: noteId,
    now,
    title: 'Images note',
    userId,
  })
}

function makeResolver(): ImageSourceResolver & { request: ReturnType<typeof vi.fn> } {
  return {
    request: vi.fn(async () => 'blob:p3-test-url'),
    release: vi.fn(),
  }
}

type RenderOptions = {
  editorApiRef?: { current: EditorShellApi | null }
  onImportImage?: ((noteId: string, file: File) => Promise<{
    imageId: string
    width: number
    height: number
  }>) | null
  resolver?: ImageSourceResolver | null
}

async function renderEditor(options: RenderOptions = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const note = makeNote()

  await act(async () => {
    root.render(
      <EditorShell
        editorApiRef={options.editorApiRef}
        imageResolver={options.resolver ?? null}
        note={note}
        onChangeDocument={vi.fn(async () => undefined)}
        onChangeTitle={vi.fn(async () => undefined)}
        onCreateNote={vi.fn()}
        onImportImage={options.onImportImage ?? null}
        onRequestLock={vi.fn()}
        pendingOperations={0}
        syncStatus="idle"
      />,
    )
    await Promise.resolve()
  })

  cleanupTasks.push(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  return { container }
}

function firePaste(target: Element, files: File[]) {
  const event = new Event('paste', { bubbles: true, cancelable: true })

  Object.defineProperty(event, 'clipboardData', {
    value: {
      files,
      getData: () => '',
      types: files.length > 0 ? ['Files'] : [],
    },
  })

  target.dispatchEvent(event)
}

describe('image insertion UX', () => {
  it('shows image entry points only when import is wired', async () => {
    const withImages = await renderEditor({
      onImportImage: vi.fn(async () => ({ imageId: 'image_x', width: 10, height: 10 })),
      resolver: makeResolver(),
    })

    expect(
      withImages.container.querySelector('button[aria-label="Insert image"]'),
    ).not.toBeNull()
    expect(
      withImages.container.querySelector('input[aria-label="Add images"]'),
    ).not.toBeNull()

    const withoutImages = await renderEditor({})

    expect(
      withoutImages.container.querySelector('button[aria-label="Insert image"]'),
    ).toBeNull()
    expect(
      withoutImages.container.querySelector('input[aria-label="Add images"]'),
    ).toBeNull()
  })

  it('imports a pasted image, inserts the block and resolves its object URL', async () => {
    const resolver = makeResolver()
    const onImportImage = vi.fn(async () => ({
      imageId: 'image_pasted',
      width: 800,
      height: 600,
    }))
    const { container } = await renderEditor({ onImportImage, resolver })

    const editorDom = container.querySelector('[role="textbox"]')
    expect(editorDom).not.toBeNull()

    const file = new File([new Uint8Array(8)], 'shot.png', { type: 'image/png' })

    await act(async () => {
      firePaste(editorDom as Element, [file])
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onImportImage).toHaveBeenCalledWith(noteId, file)

    const figure = container.querySelector('figure[data-image-id="image_pasted"]')
    expect(figure).not.toBeNull()
    expect(resolver.request).toHaveBeenCalledWith('image_pasted', 'display')

    const image = container.querySelector<HTMLImageElement>(
      'figure[data-image-id="image_pasted"] img',
    )
    expect(image?.src).toContain('blob:p3-test-url')
  })

  it('surfaces import failures in the editor notice and dismisses them', async () => {
    const onImportImage = vi.fn(async () => {
      throw new Error('Image is too large: limit exceeded.')
    })
    const { container } = await renderEditor({
      onImportImage,
      resolver: makeResolver(),
    })

    const editorDom = container.querySelector('[role="textbox"]')
    const file = new File([new Uint8Array(8)], 'huge.png', { type: 'image/png' })

    await act(async () => {
      firePaste(editorDom as Element, [file])
      await Promise.resolve()
      await Promise.resolve()
    })

    const notice = container.querySelector('.sn-editor-notice')
    expect(notice?.textContent).toContain('Image is too large')
    expect(container.querySelector('figure[data-image-block]')).toBeNull()

    await act(async () => {
      notice
        ?.querySelector<HTMLButtonElement>('button[aria-label="Dismiss message"]')
        ?.click()
      await Promise.resolve()
    })

    expect(container.querySelector('.sn-editor-notice')).toBeNull()
  })

  it('reveals an image block through the editor api', async () => {
    const scrollSpy = vi.fn()
    Element.prototype.scrollIntoView = scrollSpy

    const editorApiRef: { current: EditorShellApi | null } = { current: null }
    const { container } = await renderEditor({
      editorApiRef,
      onImportImage: vi.fn(async () => ({
        imageId: 'image_reveal',
        width: 640,
        height: 480,
      })),
      resolver: makeResolver(),
    })

    const editorDom = container.querySelector('[role="textbox"]')
    const file = new File([new Uint8Array(8)], 'reveal.png', { type: 'image/png' })

    await act(async () => {
      firePaste(editorDom as Element, [file])
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(editorApiRef.current).not.toBeNull()

    await act(async () => {
      editorApiRef.current?.revealImage('image_reveal')
      await Promise.resolve()
    })

    expect(scrollSpy).toHaveBeenCalled()
    expect(
      container.querySelector('figure[data-image-id="image_reveal"]')?.className,
    ).toContain('sn-image-block--flash')
  })
})
