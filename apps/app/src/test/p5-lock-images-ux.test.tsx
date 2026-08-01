import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  ImageRepository,
  LiveQuery,
  NoteRepository,
  Unsubscribe,
} from '@/repository/contracts'
import {
  createDraftLocalNote,
  deviceIdSchema,
  noteIdSchema,
  userIdSchema,
  type NoteDetail,
} from '@/shared/contracts'
import {
  RepositoryProvider,
  useAppUiStore,
  useLockModalViewModel,
  useTrashViewModel,
  type LockModalViewModel,
} from '@/viewmodel'
import type { TrashViewModel } from '@/viewmodel'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const userId = userIdSchema.parse('lock_images_user')
const deviceId = deviceIdSchema.parse('lock_images_device')
const noteId = noteIdSchema.parse('note_lock_images')
const now = '2026-07-18T00:00:00.000Z'
const cleanupTasks: Array<() => void> = []

afterEach(() => {
  while (cleanupTasks.length > 0) {
    cleanupTasks.pop()?.()
  }

  useAppUiStore.setState({
    activeNoteId: null,
    lockModalNoteId: null,
  })
  vi.restoreAllMocks()
})

function staticQuery<TValue>(value: TValue): LiveQuery<TValue> {
  return {
    dispose: () => undefined,
    retain: () => undefined,
    getSnapshot: () => value,
    subscribe: (): Unsubscribe => () => undefined,
  }
}

function makePlainNote(): NoteDetail {
  return createDraftLocalNote({ deviceId, id: noteId, now, title: 'Lockable', userId })
}

function makeLockedNote(): NoteDetail {
  return {
    ...makePlainNote(),
    isLocked: true,
    title: null,
    preview: null,
    document: null,
    encryptedPayload: 'ZW5jcnlwdGVk',
    encryption: {
      version: 1,
      algorithm: 'AES-GCM-256',
      payloadNonce: 'bm9uY2U=',
      wrappedDek: 'ZGVr',
      wrapNonce: 'd3JhcA==',
    },
  } as unknown as NoteDetail
}

function makeNoteRepository(note: NoteDetail) {
  return {
    liveNote: vi.fn(() => staticQuery<NoteDetail | null>(note)),
    liveTrashList: vi.fn(() => staticQuery([])),
    lockNote: vi.fn(async () => undefined),
    unlockNoteForSession: vi.fn(async () => ({ noteId, expiresAt: now })),
    purgeNote: vi.fn(async () => undefined),
    restoreNote: vi.fn(async () => undefined),
  } as unknown as NoteRepository
}

function makeImageRepository() {
  return {
    liveNoteImages: vi.fn(() => staticQuery([])),
    importImage: vi.fn(),
    getImageBlob: vi.fn(async () => null),
    reconcileNoteImages: vi.fn(async () => undefined),
    prepareNoteImagesLock: vi.fn(async () => undefined),
    commitPreparedNoteImagesLock: vi.fn(async () => undefined),
    rollbackPreparedNoteImagesLock: vi.fn(async () => undefined),
    lockNoteImages: vi.fn(async () => undefined),
    unlockSweep: vi.fn(async () => undefined),
    purgeNoteImages: vi.fn(async () => undefined),
    purgeExpiredImages: vi.fn(async () => 0),
    readBackupImages: vi.fn(async () => []),
    restoreBackupImages: vi.fn(async () => 0),
    recoverPendingImageOperations: vi.fn(async () => undefined),
  } satisfies ImageRepository
}

function renderProbe(
  repository: NoteRepository,
  imageRepository: ImageRepository,
  Probe: () => null,
) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <RepositoryProvider imageRepository={imageRepository} repository={repository}>
        <Probe />
      </RepositoryProvider>,
    )
  })

  cleanupTasks.push(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })
}

describe('image lock lifecycle wiring', () => {
  it('locking a note also encrypts its images, after the master key is cached', async () => {
    const repository = makeNoteRepository(makePlainNote())
    const imageRepository = makeImageRepository()
    let viewModel: LockModalViewModel | null = null

    function Probe() {
      viewModel = useLockModalViewModel()
      return null
    }

    renderProbe(repository, imageRepository, Probe)

    act(() => {
      useAppUiStore.setState({ lockModalNoteId: noteId })
    })

    await act(async () => {
      await viewModel?.submit({ masterPassword: 'correct horse battery' })
    })

    expect(repository.lockNote).toHaveBeenCalledWith(noteId, {
      masterPassword: 'correct horse battery',
    })
    expect(imageRepository.prepareNoteImagesLock).toHaveBeenCalledWith(noteId, {
      masterPassword: 'correct horse battery',
    })
    expect(imageRepository.commitPreparedNoteImagesLock).toHaveBeenCalledWith(noteId)
    // Ciphertext preparation precedes the note lock; promotion follows it.
    expect(
      (imageRepository.prepareNoteImagesLock as ReturnType<typeof vi.fn>).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      (repository.lockNote as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0],
    )
    expect(
      (imageRepository.commitPreparedNoteImagesLock as ReturnType<typeof vi.fn>).mock
        .invocationCallOrder[0],
    ).toBeGreaterThan(
      (repository.lockNote as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0],
    )
  })

  it('unlocking runs the self-heal sweep and survives its failure', async () => {
    const repository = makeNoteRepository(makeLockedNote())
    const imageRepository = makeImageRepository()
    ;(imageRepository.unlockSweep as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('sweep failed'),
    )
    let viewModel: LockModalViewModel | null = null

    function Probe() {
      viewModel = useLockModalViewModel()
      return null
    }

    renderProbe(repository, imageRepository, Probe)

    act(() => {
      useAppUiStore.setState({ lockModalNoteId: noteId })
    })

    await act(async () => {
      await viewModel?.submit({ masterPassword: 'correct horse battery' })
    })

    expect(repository.unlockNoteForSession).toHaveBeenCalledWith(noteId, {
      masterPassword: 'correct horse battery',
    })
    expect(imageRepository.unlockSweep).toHaveBeenCalledWith(noteId)
    // The failed sweep must not block the unlock: the modal closed cleanly.
    expect(useAppUiStore.getState().lockModalNoteId).toBeNull()
    expect(useAppUiStore.getState().activeNoteId).toBe(noteId)
  })

  it('rolls prepared image encryption back when the note lock fails', async () => {
    const repository = makeNoteRepository(makePlainNote())
    const imageRepository = makeImageRepository()
    ;(repository.lockNote as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('note lock failed'),
    )
    let viewModel: LockModalViewModel | null = null

    function Probe() {
      viewModel = useLockModalViewModel()
      return null
    }

    renderProbe(repository, imageRepository, Probe)
    act(() => {
      useAppUiStore.setState({ lockModalNoteId: noteId })
    })

    await act(async () => {
      await viewModel?.submit({ masterPassword: 'correct horse battery' })
    })

    expect(imageRepository.prepareNoteImagesLock).toHaveBeenCalled()
    expect(imageRepository.rollbackPreparedNoteImagesLock).toHaveBeenCalledWith(noteId)
    expect(imageRepository.commitPreparedNoteImagesLock).not.toHaveBeenCalled()
    expect((viewModel as LockModalViewModel | null)?.error).toBe('note lock failed')
  })

  it('purging a note from trash purges its image blobs too', async () => {
    const repository = makeNoteRepository(makePlainNote())
    const imageRepository = makeImageRepository()
    let viewModel: TrashViewModel | null = null

    function Probe() {
      viewModel = useTrashViewModel()
      return null
    }

    renderProbe(repository, imageRepository, Probe)

    await act(async () => {
      await viewModel?.purgeNote(noteId)
    })

    expect(repository.purgeNote).toHaveBeenCalledWith(noteId)
    expect(imageRepository.purgeNoteImages).toHaveBeenCalledWith(noteId)
  })

  it('treats failed post-note image cleanup as deferred recovery', async () => {
    const repository = makeNoteRepository(makePlainNote())
    const imageRepository = makeImageRepository()
    ;(imageRepository.purgeNoteImages as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('filesystem busy'),
    )
    let viewModel: TrashViewModel | null = null

    function Probe() {
      viewModel = useTrashViewModel()
      return null
    }

    renderProbe(repository, imageRepository, Probe)

    await expect(
      act(async () => {
        await viewModel?.purgeNote(noteId)
      }),
    ).resolves.toBeUndefined()
    expect(repository.purgeNote).toHaveBeenCalledWith(noteId)
  })
})
