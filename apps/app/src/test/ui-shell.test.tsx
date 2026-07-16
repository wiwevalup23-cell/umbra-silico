import type { ComponentProps, ReactNode } from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  allowedBackgroundImages,
  backgroundImageOptions,
} from '@/shared/backgrounds'
import {
  createDraftLocalNote,
  deviceIdSchema,
  documentV1Contract,
  noteIdSchema,
  parseNoteDocument,
  userIdSchema,
  type NoteListItem,
} from '@/shared/contracts'
import { EditorShell, NoteList } from '@/ui/components/notes'
import { SettingsModal } from '@/ui/components/silicon/SettingsModal'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const cleanupTasks: Array<() => void> = []
const userId = userIdSchema.parse('ui_user')
const deviceId = deviceIdSchema.parse('ui_device')
const now = '2026-07-03T00:00:00.000Z'
const plainNoteId = noteIdSchema.parse('note_ui_plain')
const lockedNoteId = noteIdSchema.parse('note_ui_locked')

function renderUi(children: ReactNode) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  act(() => {
    root.render(children)
  })

  return {
    container,
    cleanup() {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}

afterEach(() => {
  vi.useRealTimers()

  while (cleanupTasks.length > 0) {
    cleanupTasks.pop()?.()
  }
})

function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set

  valueSetter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('Silicon Nostalgia UI shell', () => {
  it('allows every visible background option to be selected', () => {
    const updateSetting = vi.fn<ComponentProps<typeof SettingsModal>['updateSetting']>()
    const rendered = renderUi(
      <SettingsModal
        onClose={vi.fn()}
        settings={{
          backgroundImage: null,
          inspectorWidth: 240,
          sidebarWidth: 260,
        }}
        updateSetting={updateSetting}
      />,
    )
    cleanupTasks.push(rendered.cleanup)

    const buttons = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('.sn-background-option'),
    )
    const selectedValues: Array<string | null> = []

    expect(buttons).toHaveLength(backgroundImageOptions.length)

    for (const option of backgroundImageOptions) {
      const button = buttons.find((candidate) =>
        candidate.textContent?.includes(option.label),
      )

      expect(button).toBeDefined()

      act(() => {
        button?.click()
      })

      selectedValues.push(option.value)
    }

    expect(updateSetting.mock.calls.map((call) => call[1])).toEqual(selectedValues)
    expect(
      backgroundImageOptions
        .map((option) => option.value)
        .filter((value): value is string => value !== null)
        .every((value) => allowedBackgroundImages.has(value)),
    ).toBe(true)
  })

  it('renders note navigation from props and delegates note actions', () => {
    const onCreateNote = vi.fn()
    const onOpenLockedNote = vi.fn()
    const onSelectNote = vi.fn()
    const notes: NoteListItem[] = [
      {
        id: plainNoteId,
        isLocked: false,
        parentFolderId: null,
        preview: 'Glass paragraph',
        syncStatus: 'dirty',
        title: 'Plain note',
        updatedAt: now,
      },
      {
        id: lockedNoteId,
        isLocked: true,
        parentFolderId: null,
        preview: '',
        syncStatus: 'synced',
        title: 'Locked note',
        updatedAt: now,
      },
    ]

    const rendered = renderUi(
      <NoteList
        activeNoteId={plainNoteId}
        notes={notes}
        onCreateNote={onCreateNote}
        onOpenLockedNote={onOpenLockedNote}
        onSelectNote={onSelectNote}
      />,
    )
    cleanupTasks.push(rendered.cleanup)

    const cards = rendered.container.querySelectorAll<HTMLButtonElement>('.sn-note-card')

    act(() => {
      cards[0]?.click()
    })
    act(() => {
      cards[1]?.click()
    })

    expect(rendered.container.textContent).toContain('Plain note')
    expect(onSelectNote).toHaveBeenCalledWith(plainNoteId)
    expect(onOpenLockedNote).toHaveBeenCalledWith(lockedNoteId)
  })

  it('renders the editor shell from note props and delegates lock requests', async () => {
    const onChangeDocument = vi.fn(async () => undefined)
    const onChangeTitle = vi.fn(async () => undefined)
    const onCreateNote = vi.fn()
    const onRequestLock = vi.fn()
    const note = {
      ...createDraftLocalNote({
        document: {
          ...documentV1Contract.createEmpty(),
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'A polished glass note.' }],
              },
            ],
          },
        },
        deviceId,
        id: plainNoteId,
        now,
        title: 'Active Surface',
        userId,
      }),
      preview: 'A polished glass note.',
    }

    const rendered = renderUi(
      <EditorShell
        note={note}
        onChangeDocument={onChangeDocument}
        onChangeTitle={onChangeTitle}
        onCreateNote={onCreateNote}
        onRequestLock={onRequestLock}
        pendingOperations={2}
        syncStatus="idle"
      />,
    )
    cleanupTasks.push(rendered.cleanup)

    const lockButton = rendered.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Lock note"]',
    )

    await act(async () => {
      lockButton?.click()
      await Promise.resolve()
    })

    expect(
      rendered.container.querySelector<HTMLInputElement>(
        'input[aria-label="Note title"]',
      )?.value,
    ).toBe('Active Surface')
    expect(rendered.container.querySelector('[role="textbox"]')?.textContent).toContain(
      'A polished glass note.',
    )
    expect(rendered.container.textContent).toContain('H1')
    expect(onRequestLock).toHaveBeenCalledWith(plainNoteId)
  })

  it('renders table and block layout controls for rich documents', () => {
    const onChangeDocument = vi.fn(async () => undefined)
    const onChangeTitle = vi.fn(async () => undefined)
    const onCreateNote = vi.fn()
    const onRequestLock = vi.fn()
    const document = parseNoteDocument({
      schemaVersion: 1,
      editor: 'tiptap',
      content: {
        type: 'doc',
        attrs: {
          pageFooterOffset: 56,
          pageHeaderOffset: 72,
        },
        content: [
          {
            type: 'paragraph',
            attrs: {
              blockIndent: 2,
              blockMargin: 'wide',
            },
            content: [{ type: 'text', text: 'Indented table note.' }],
          },
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableHeader',
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Field' }],
                      },
                    ],
                  },
                  {
                    type: 'tableHeader',
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Value' }],
                      },
                    ],
                  },
                ],
              },
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableCell',
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Mood' }],
                      },
                    ],
                  },
                  {
                    type: 'tableCell',
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Clear' }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    })
    const note = {
      ...createDraftLocalNote({
        deviceId,
        document,
        id: plainNoteId,
        now,
        title: 'Rich Surface',
        userId,
      }),
      preview: 'Indented table note.',
    }

    const rendered = renderUi(
      <EditorShell
        note={note}
        onChangeDocument={onChangeDocument}
        onChangeTitle={onChangeTitle}
        onCreateNote={onCreateNote}
        onRequestLock={onRequestLock}
        pendingOperations={2}
        syncStatus="idle"
      />,
    )
    cleanupTasks.push(rendered.cleanup)

    expect(documentV1Contract.schema.parse(document)).toEqual(document)
    expect(rendered.container.querySelector('table')).not.toBeNull()
    expect(rendered.container.querySelector('[data-block-indent="2"]')).not.toBeNull()
    expect(
      rendered.container
        .querySelector<HTMLElement>('.sn-editor-paper--editable')
        ?.style.getPropertyValue('--sn-page-header-offset'),
    ).toBe('72px')
    expect(rendered.container.textContent).not.toContain('M+')
    expect(rendered.container.textContent).not.toContain('R+')

    act(() => {
      rendered.container
        .querySelector<HTMLButtonElement>('button[aria-label="More editor tools"]')
        ?.click()
    })

    expect(rendered.container.textContent).toContain('Tbl')
    expect(rendered.container.textContent).toContain('M+')
    expect(rendered.container.textContent).toContain('R+')
    expect(rendered.container.textContent).toContain('72px')
    expect(rendered.container.textContent).toContain('56px')
  })

  it('debounces title autosave through editor callbacks', async () => {
    vi.useFakeTimers()

    const onChangeDocument = vi.fn(async () => undefined)
    const onChangeTitle = vi.fn(async () => undefined)
    const onCreateNote = vi.fn()
    const onRequestLock = vi.fn()
    const note = {
      ...createDraftLocalNote({
        deviceId,
        id: plainNoteId,
        now,
        title: 'Draft Title',
        userId,
      }),
      preview: '',
    }

    const rendered = renderUi(
      <EditorShell
        note={note}
        onChangeDocument={onChangeDocument}
        onChangeTitle={onChangeTitle}
        onCreateNote={onCreateNote}
        onRequestLock={onRequestLock}
        pendingOperations={2}
        syncStatus="idle"
      />,
    )
    cleanupTasks.push(rendered.cleanup)

    const titleInput = rendered.container.querySelector<HTMLInputElement>(
      'input[aria-label="Note title"]',
    )

    await act(async () => {
      if (!titleInput) {
        throw new Error('Expected title input.')
      }

      setInputValue(titleInput, 'Renamed Draft')
      await Promise.resolve()
    })

    expect(onChangeTitle).not.toHaveBeenCalled()

    // Manual-save model: a quick debounce no longer fires; the background
    // autosave waits five minutes before committing on its own.
    await act(async () => {
      vi.advanceTimersByTime(450)
      await Promise.resolve()
    })

    expect(onChangeTitle).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000)
      await Promise.resolve()
    })

    expect(onChangeTitle).toHaveBeenCalledWith(plainNoteId, 'Renamed Draft')
  })

  it('saves immediately through the Save button', async () => {
    vi.useFakeTimers()

    const onChangeDocument = vi.fn(async () => undefined)
    const onChangeTitle = vi.fn(async () => undefined)
    const note = {
      ...createDraftLocalNote({
        deviceId,
        id: plainNoteId,
        now,
        title: 'Draft Title',
        userId,
      }),
      preview: '',
    }

    const rendered = renderUi(
      <EditorShell
        note={note}
        onChangeDocument={onChangeDocument}
        onChangeTitle={onChangeTitle}
        onCreateNote={vi.fn()}
        onRequestLock={vi.fn()}
        pendingOperations={0}
        syncStatus="idle"
      />,
    )
    cleanupTasks.push(rendered.cleanup)

    const titleInput = rendered.container.querySelector<HTMLInputElement>(
      'input[aria-label="Note title"]',
    )
    const saveButton = rendered.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Save note"]',
    )

    expect(saveButton).not.toBeNull()
    expect(saveButton?.disabled).toBe(true)

    await act(async () => {
      if (!titleInput) {
        throw new Error('Expected title input.')
      }

      setInputValue(titleInput, 'Renamed Draft')
      await Promise.resolve()
    })

    expect(saveButton?.disabled).toBe(false)
    expect(onChangeTitle).not.toHaveBeenCalled()

    await act(async () => {
      saveButton?.click()
      await Promise.resolve()
    })

    expect(onChangeTitle).toHaveBeenCalledWith(plainNoteId, 'Renamed Draft')
  })

  it('renders the empty-state player and delegates play to note creation', () => {
    const onChangeDocument = vi.fn(async () => undefined)
    const onChangeTitle = vi.fn(async () => undefined)
    const onCreateNote = vi.fn()
    const onRequestLock = vi.fn()

    const rendered = renderUi(
      <EditorShell
        note={null}
        onChangeDocument={onChangeDocument}
        onChangeTitle={onChangeTitle}
        onCreateNote={onCreateNote}
        onRequestLock={onRequestLock}
        pendingOperations={2}
        syncStatus="idle"
      />,
    )
    cleanupTasks.push(rendered.cleanup)

    const playButton = rendered.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Create note"]',
    )
    const playerImage = rendered.container.querySelector<HTMLImageElement>(
      'img[src="/assets/player-warm-cut.png"]',
    )
    const syncProgress = rendered.container.querySelector('[role="progressbar"]')

    act(() => {
      playButton?.click()
    })

    expect(rendered.container.textContent).toContain('Ready to record')
    expect(rendered.container.textContent).toContain('Press play to create a new document')
    expect(playerImage?.alt).toBe('')
    expect(syncProgress).toBeNull()
    expect(onCreateNote).toHaveBeenCalledOnce()
  })
})
