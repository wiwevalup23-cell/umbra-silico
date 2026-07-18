import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createDraftLocalNote,
  deviceIdSchema,
  imageIdSchema,
  noteIdSchema,
  userIdSchema,
  type ImageSourceResolver,
  type NoteDetail,
  type NoteImageListItem,
} from '@/shared/contracts'
import { WorkspaceInspector } from '@/ui/components/notes/WorkspaceInspector'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const cleanupTasks: Array<() => void> = []
const userId = userIdSchema.parse('gallery_ux_user')
const deviceId = deviceIdSchema.parse('gallery_ux_device')
const noteId = noteIdSchema.parse('note_gallery_ux')
const now = '2026-07-18T00:00:00.000Z'

afterEach(() => {
  while (cleanupTasks.length > 0) {
    cleanupTasks.pop()?.()
  }
  vi.restoreAllMocks()
})

function makeNote(): NoteDetail {
  return createDraftLocalNote({
    deviceId,
    id: noteId,
    now,
    title: 'Gallery note',
    userId,
  })
}

function makeImages(count: number): NoteImageListItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: imageIdSchema.parse(`image_gallery_${index}`),
    noteId,
    width: 4000,
    height: 3000,
    createdAt: now,
    isEncrypted: false,
    mimeType: 'image/jpeg',
  }))
}

function makeResolver(): ImageSourceResolver & { request: ReturnType<typeof vi.fn> } {
  return {
    request: vi.fn(async () => 'blob:gallery-thumb'),
    release: vi.fn(),
  }
}

type RenderProps = Partial<Parameters<typeof WorkspaceInspector>[0]>

async function renderInspector(props: RenderProps = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(
      <WorkspaceInspector
        activeNote={props.activeNote ?? makeNote()}
        imageResolver={props.imageResolver ?? null}
        noteCount={1}
        noteImages={props.noteImages ?? []}
        onRevealImage={props.onRevealImage}
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

  async function openPhotosTab() {
    const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    const photosTab = tabs.find((tab) => tab.textContent?.includes('Photos'))

    await act(async () => {
      photosTab?.click()
      await Promise.resolve()
    })

    return photosTab ?? null
  }

  return { container, openPhotosTab }
}

describe('note photo gallery', () => {
  it('shows the Photos tab with a count badge and renders thumbnails', async () => {
    const resolver = makeResolver()
    const { container, openPhotosTab } = await renderInspector({
      imageResolver: resolver,
      noteImages: makeImages(3),
    })

    const photosTab = await openPhotosTab()

    expect(photosTab?.getAttribute('aria-selected')).toBe('true')
    expect(photosTab?.querySelector('.sn-inspector-tab__badge')?.textContent).toBe('3')

    const thumbs = container.querySelectorAll('.sn-note-gallery__thumb')
    expect(thumbs).toHaveLength(3)
    expect(resolver.request).toHaveBeenCalledWith('image_gallery_0', 'thumb')

    const image = container.querySelector<HTMLImageElement>(
      '.sn-note-gallery__thumb img',
    )
    expect(image?.src).toContain('blob:gallery-thumb')
  })

  it('fires onRevealImage when a thumbnail is chosen', async () => {
    const onRevealImage = vi.fn()
    const { container, openPhotosTab } = await renderInspector({
      imageResolver: makeResolver(),
      noteImages: makeImages(2),
      onRevealImage,
    })

    await openPhotosTab()

    await act(async () => {
      container
        .querySelectorAll<HTMLButtonElement>('.sn-note-gallery__thumb')[1]
        ?.click()
      await Promise.resolve()
    })

    expect(onRevealImage).toHaveBeenCalledWith('image_gallery_1')
  })

  it('shows the empty state when the note has no images', async () => {
    const { container, openPhotosTab } = await renderInspector({
      imageResolver: makeResolver(),
      noteImages: [],
    })

    const photosTab = await openPhotosTab()

    expect(photosTab?.querySelector('.sn-inspector-tab__badge')).toBeNull()
    expect(container.querySelector('.sn-note-gallery__empty')?.textContent).toContain(
      'No photos yet',
    )
  })

  it('hides thumbnails behind a lock placeholder for locked notes', async () => {
    const lockedNote = {
      ...makeNote(),
      isLocked: true as const,
      title: null,
      preview: null,
      document: null,
      properties: undefined,
      encryptedPayload: 'ZW5jcnlwdGVk',
      encryption: {
        version: 1 as const,
        algorithm: 'AES-GCM-256' as const,
        payloadNonce: 'bm9uY2U=',
        wrappedDek: 'ZGVr',
        wrapNonce: 'd3JhcA==',
      },
    }

    const { container, openPhotosTab } = await renderInspector({
      activeNote: lockedNote as unknown as NoteDetail,
      imageResolver: makeResolver(),
      noteImages: makeImages(2),
    })

    await openPhotosTab()

    expect(container.textContent).toContain('Photos are encrypted')
    expect(container.querySelector('.sn-note-gallery__thumb')).toBeNull()
  })
})
