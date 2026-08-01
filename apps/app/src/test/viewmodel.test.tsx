import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LiveQuery, NoteRepository, Unsubscribe } from '@/repository/contracts'
import type { SyncEngine } from '@/sync'
import {
  createDraftLocalNote,
  deviceIdSchema,
  documentV1Contract,
  noteIdSchema,
  operationIdSchema,
  userIdSchema,
  type LocalNote,
  type NoteId,
  type NoteListItem,
  type SyncOperation,
  type SyncStatusSnapshot,
} from '@/shared/contracts'
import {
  RepositoryProvider,
  SyncEngineProvider,
  useActiveNoteViewModel,
  useAppUiStore,
  useLockModalViewModel,
  useNotesViewModel,
  useSyncViewModel,
} from '@/viewmodel'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class MutableLiveQuery<TValue> implements LiveQuery<TValue> {
  disposed = false

  private readonly listeners = new Set<() => void>()
  private snapshot: TValue

  constructor(snapshot: TValue) {
    this.snapshot = snapshot
  }

  dispose(): void {
    this.disposed = true
    this.listeners.clear()
  }

  retain(): void {
    this.disposed = false
  }

  getSnapshot(): TValue {
    return this.snapshot
  }

  subscribe(listener: () => void): Unsubscribe {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  setSnapshot(nextSnapshot: TValue): void {
    this.snapshot = nextSnapshot
    for (const listener of this.listeners) {
      listener()
    }
  }
}

const userId = userIdSchema.parse('vm_user')
const deviceId = deviceIdSchema.parse('vm_device')
const firstNoteId = noteIdSchema.parse('note_vm_1')
const secondNoteId = noteIdSchema.parse('note_vm_2')
const now = '2026-07-03T00:00:00.000Z'

function makeNote(id: NoteId, title: string): LocalNote {
  return {
    ...createDraftLocalNote({
      id,
      userId,
      deviceId,
      now,
      title,
    }),
    preview: `${title} preview`,
  }
}

function makeListItem(note: LocalNote): NoteListItem {
  return {
    id: note.id,
    title: note.isLocked ? 'Locked note' : note.title,
    preview: note.preview ?? '',
    isLocked: note.isLocked,
    parentFolderId: note.parentFolderId,
    updatedAt: note.updatedAt,
    syncStatus: note.syncStatus,
  }
}

function makeOperation(noteId: NoteId): SyncOperation {
  return {
    opId: operationIdSchema.parse(`op_${noteId}`),
    noteId,
    userId,
    deviceId,
    type: 'note.update',
    payload: { noteId },
    baseRemoteRevision: null,
    createdAt: now,
    attemptCount: 0,
    lastError: null,
    status: 'pending',
  }
}

function makeSyncSnapshot(
  patch: Partial<SyncStatusSnapshot> = {},
): SyncStatusSnapshot {
  return {
    lastError: null,
    lastSyncedAt: null,
    pendingOperations: 0,
    status: 'idle',
    ...patch,
  }
}

function createMockRepository() {
  const noteListQuery = new MutableLiveQuery<NoteListItem[]>([])
  const trashListQuery = new MutableLiveQuery<NoteListItem[]>([])
  const folderTreeQuery = new MutableLiveQuery([])
  const noteQueries = new Map<NoteId, MutableLiveQuery<LocalNote | null>>()
  const createdNoteId = secondNoteId
  const repository: NoteRepository = {
    liveNoteList: vi.fn(() => noteListQuery),
    liveTrashList: vi.fn(() => trashListQuery),
    liveFolderTree: vi.fn(() => folderTreeQuery),
    readBackupData: vi.fn(async () => ({ cryptoProfile: null, folders: [], notes: [] })),
    restoreBackupData: vi.fn(async () => ({
      cryptoProfileRestored: false,
      foldersAdded: 0,
      foldersSkipped: 0,
      notesAdded: 0,
      notesSkipped: 0,
    })),
    listNoteVersions: vi.fn(async () => []),
    restoreNoteVersion: vi.fn(async () => undefined),
    liveNote: vi.fn((noteId) => {
      const existing = noteQueries.get(noteId)

      if (existing) {
        return existing
      }

      const query = new MutableLiveQuery<LocalNote | null>(null)
      noteQueries.set(noteId, query)
      return query
    }),
    createFolder: vi.fn(async () => {
      throw new Error('Not implemented in viewmodel tests.')
    }),
    createNote: vi.fn(async () => createdNoteId),
    deleteFolder: vi.fn(async () => undefined),
    updateNote: vi.fn(async () => undefined),
    deleteNote: vi.fn(async () => undefined),
    moveFolder: vi.fn(async () => undefined),
    moveNoteToFolder: vi.fn(async () => undefined),
    purgeNote: vi.fn(async () => undefined),
    renameFolder: vi.fn(async () => undefined),
    restoreNote: vi.fn(async () => undefined),
    getNote: vi.fn(async () => null),
    lockNote: vi.fn(async () => ({ recoveryKey: null })),
    unlockNoteForSession: vi.fn(async () => ({
      noteId: firstNoteId,
      expiresAt: now,
    })),
    getPendingOps: vi.fn(async () => [makeOperation(firstNoteId)]),
    getLastServerRevision: vi.fn(async () => 0),
    markOpSynced: vi.fn(async () => undefined),
    markOpFailed: vi.fn(async () => undefined),
    setLastServerRevision: vi.fn(async () => undefined),
    applyRemoteChange: vi.fn(async () => undefined),
    markConflict: vi.fn(async () => undefined),
  }

  return {
    createdNoteId,
    noteListQuery,
    noteQueries,
    repository,
  }
}

function createMockSyncEngine(initialSnapshot: SyncStatusSnapshot) {
  let snapshot = initialSnapshot
  const listeners = new Set<(status: SyncStatusSnapshot) => void>()
  const engine: SyncEngine = {
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    requestSync: vi.fn(),
    getStatus: vi.fn(() => snapshot),
    subscribe: vi.fn((listener) => {
      listeners.add(listener)
      listener(snapshot)

      return () => {
        listeners.delete(listener)
      }
    }),
  }

  return {
    emit(nextSnapshot: SyncStatusSnapshot) {
      snapshot = nextSnapshot

      for (const listener of listeners) {
        listener(snapshot)
      }
    },
    engine,
  }
}

function renderWithRepository(
  repository: NoteRepository,
  children: React.ReactNode,
  syncEngine: SyncEngine | null = null,
) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <RepositoryProvider repository={repository}>
        <SyncEngineProvider syncEngine={syncEngine}>{children}</SyncEngineProvider>
      </RepositoryProvider>,
    )
  })

  return {
    container,
    root,
    cleanup() {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}

const cleanupTasks: Array<() => void> = []

afterEach(() => {
  while (cleanupTasks.length > 0) {
    cleanupTasks.pop()?.()
  }

  useAppUiStore.setState({
    activeNoteId: null,
    lockModalNoteId: null,
    openWindows: ['workspace'],
    syncBadge: 'idle',
  })
})

describe('ViewModel hooks', () => {
  it('streams note lists from Repository live queries without storing notes in Zustand', () => {
    const { noteListQuery, repository } = createMockRepository()
    const firstNote = makeNote(firstNoteId, 'First')

    function NotesProbe() {
      const viewModel = useNotesViewModel()
      return <output>{viewModel.notes.map((note) => note.title).join(',')}</output>
    }

    const rendered = renderWithRepository(repository, <NotesProbe />)
    cleanupTasks.push(rendered.cleanup)

    expect(rendered.container.textContent).toBe('')

    act(() => {
      noteListQuery.setSnapshot([makeListItem(firstNote)])
    })

    expect(rendered.container.textContent).toBe('First')
    expect('notes' in useAppUiStore.getState()).toBe(false)
  })

  it('routes create/select actions through Repository and UI-only Zustand state', async () => {
    const { createdNoteId, repository } = createMockRepository()
    const sync = createMockSyncEngine(makeSyncSnapshot())
    let createFromViewModel: (() => Promise<NoteId>) | null = null

    function NotesActionsProbe() {
      const viewModel = useNotesViewModel()

      useEffect(() => {
        createFromViewModel = () => viewModel.createNote({ title: 'Created' })
      }, [viewModel])

      return <output>{viewModel.activeNoteId ?? 'none'}</output>
    }

    const rendered = renderWithRepository(repository, <NotesActionsProbe />, sync.engine)
    cleanupTasks.push(rendered.cleanup)

    await act(async () => {
      await createFromViewModel?.()
    })

    expect(repository.createNote).toHaveBeenCalledWith({ title: 'Created' })
    expect(sync.engine.requestSync).toHaveBeenCalledWith('outbox-change')
    expect(useAppUiStore.getState().activeNoteId).toBe(createdNoteId)
    expect(rendered.container.textContent).toBe(createdNoteId)
  })

  it('streams active note details from Repository live queries', () => {
    const { noteQueries, repository } = createMockRepository()
    const note = makeNote(firstNoteId, 'Active')
    useAppUiStore.getState().setActiveNote(firstNoteId)

    function ActiveNoteProbe() {
      const viewModel = useActiveNoteViewModel()
      return <output>{viewModel.note?.title ?? 'missing'}</output>
    }

    const rendered = renderWithRepository(repository, <ActiveNoteProbe />)
    cleanupTasks.push(rendered.cleanup)

    expect(rendered.container.textContent).toBe('missing')

    act(() => {
      noteQueries.get(firstNoteId)?.setSnapshot(note)
    })

    expect(rendered.container.textContent).toBe('Active')
  })

  it('routes active note title and document updates through Repository by note id', async () => {
    const { repository } = createMockRepository()
    const sync = createMockSyncEngine(makeSyncSnapshot())
    const document = {
      ...documentV1Contract.createEmpty(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Autosaved body' }],
          },
        ],
      },
    }
    let updateTitle: ((noteId: NoteId, title: string) => Promise<void>) | null = null
    let updateDocument:
      | ((noteId: NoteId, nextDocument: typeof document) => Promise<void>)
      | null = null

    function ActiveNoteActionsProbe() {
      const viewModel = useActiveNoteViewModel()

      useEffect(() => {
        updateTitle = viewModel.updateTitle
        updateDocument = viewModel.updateDocument
      }, [viewModel])

      return <output>ready</output>
    }

    const rendered = renderWithRepository(repository, <ActiveNoteActionsProbe />, sync.engine)
    cleanupTasks.push(rendered.cleanup)

    await act(async () => {
      await updateTitle?.(firstNoteId, 'Autosaved title')
      await updateDocument?.(firstNoteId, document)
    })

    expect(repository.updateNote).toHaveBeenCalledWith(firstNoteId, {
      title: 'Autosaved title',
    })
    expect(repository.updateNote).toHaveBeenCalledWith(firstNoteId, { document })
    expect(sync.engine.requestSync).toHaveBeenCalledTimes(2)
    expect(sync.engine.requestSync).toHaveBeenCalledWith('outbox-change')
  })

  it('keeps sync badge in UI state and reads pending operation count from Repository', async () => {
    const { repository } = createMockRepository()

    function SyncProbe() {
      const viewModel = useSyncViewModel()
      return (
        <output>
          {viewModel.status}:{viewModel.pendingOperations}
        </output>
      )
    }

    const rendered = renderWithRepository(repository, <SyncProbe />)
    cleanupTasks.push(rendered.cleanup)

    await act(async () => {
      useAppUiStore.getState().setSyncBadge('syncing')
    })

    expect(repository.getPendingOps).toHaveBeenCalledWith(1000)
    expect(rendered.container.textContent).toBe('syncing:1')
  })

  it('subscribes to Sync Engine snapshots and requests manual sync refreshes', async () => {
    const { repository } = createMockRepository()
    const sync = createMockSyncEngine(
      makeSyncSnapshot({
        pendingOperations: 2,
        status: 'syncing',
      }),
    )
    let refreshPendingOperations: (() => Promise<void>) | null = null

    function SyncProbe() {
      const viewModel = useSyncViewModel()

      useEffect(() => {
        refreshPendingOperations = viewModel.refreshPendingOperations
      }, [viewModel])

      return (
        <output>
          {viewModel.status}:{viewModel.pendingOperations}
        </output>
      )
    }

    const rendered = renderWithRepository(repository, <SyncProbe />, sync.engine)
    cleanupTasks.push(rendered.cleanup)

    expect(repository.getPendingOps).not.toHaveBeenCalled()
    expect(rendered.container.textContent).toBe('syncing:2')

    act(() => {
      sync.emit(
        makeSyncSnapshot({
          pendingOperations: 4,
          status: 'conflict',
        }),
      )
    })

    expect(rendered.container.textContent).toBe('conflict:4')

    await act(async () => {
      await refreshPendingOperations?.()
    })

    expect(sync.engine.requestSync).toHaveBeenCalledWith('manual')
  })

  it('locks notes through the lock modal ViewModel and requests an outbox sync', async () => {
    const { noteQueries, repository } = createMockRepository()
    const sync = createMockSyncEngine(makeSyncSnapshot())
    const note = makeNote(firstNoteId, 'Lockable')
    let submit: ((credentials: { masterPassword?: string }) => Promise<void>) | null = null

    useAppUiStore.getState().openLockModal(firstNoteId)

    function LockModalProbe() {
      const viewModel = useLockModalViewModel()

      useEffect(() => {
        submit = viewModel.submit
      }, [viewModel])

      return <output>{viewModel.mode}</output>
    }

    const rendered = renderWithRepository(repository, <LockModalProbe />, sync.engine)
    cleanupTasks.push(rendered.cleanup)

    act(() => {
      noteQueries.get(firstNoteId)?.setSnapshot(note)
    })

    expect(rendered.container.textContent).toBe('lock')

    await act(async () => {
      await submit?.({ masterPassword: 'correct horse battery staple' })
    })

    expect(repository.lockNote).toHaveBeenCalledWith(firstNoteId, {
      masterPassword: 'correct horse battery staple',
    })
    expect(sync.engine.requestSync).toHaveBeenCalledWith('outbox-change')
    expect(useAppUiStore.getState().lockModalNoteId).toBeNull()
  })

  it('unlocks notes through the lock modal ViewModel and selects the note', async () => {
    const { noteQueries, repository } = createMockRepository()
    const lockedNote: LocalNote = {
      ...makeNote(firstNoteId, 'Locked source'),
      title: null,
      preview: null,
      isLocked: true,
      document: null,
      encryptedPayload: 'ciphertext.base64',
      encryption: {
        version: 1,
        algorithm: 'AES-GCM-256',
        payloadNonce: 'payload-nonce',
        wrappedDek: 'wrapped-dek',
        wrapNonce: 'wrap-nonce',
      },
    }
    let submit: ((credentials: { masterPassword?: string }) => Promise<void>) | null = null

    useAppUiStore.getState().openLockModal(firstNoteId)

    function UnlockModalProbe() {
      const viewModel = useLockModalViewModel()

      useEffect(() => {
        submit = viewModel.submit
      }, [viewModel])

      return <output>{viewModel.mode}</output>
    }

    const rendered = renderWithRepository(repository, <UnlockModalProbe />)
    cleanupTasks.push(rendered.cleanup)

    act(() => {
      noteQueries.get(firstNoteId)?.setSnapshot(lockedNote)
    })

    expect(rendered.container.textContent).toBe('unlock')

    await act(async () => {
      await submit?.({ masterPassword: 'correct horse battery staple' })
    })

    expect(repository.unlockNoteForSession).toHaveBeenCalledWith(firstNoteId, {
      masterPassword: 'correct horse battery staple',
    })
    expect(useAppUiStore.getState().activeNoteId).toBe(firstNoteId)
    expect(useAppUiStore.getState().lockModalNoteId).toBeNull()
  })
})
