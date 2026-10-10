import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { ImageProcessor } from '@/images'
import { createRepositories, type Repositories } from '@/repository'
import {
  RepositoryProvider,
  useAppUiStore,
  useLockModalViewModel,
  type LockModalViewModel,
} from '@/viewmodel'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * The lock flow wired exactly as the app wires it: notes and images share one
 * store and one keyring, and the dialog's view model drives both.
 *
 * The unit tests mock the repositories, and every mock answered "no recovery
 * key" from the image side — so none of them noticed that image preparation,
 * which runs first, is the step that creates the vault on a fresh device. The
 * key was created there and dropped, and nobody ever saw it.
 */

const masterPassword = 'correct horse battery staple'
const cleanupTasks: Array<() => void> = []
let databaseCounter = 0

// Never reached: these notes carry no images. Present so the factory does not
// build the canvas-backed processor jsdom cannot provide.
const unusedImageProcessor: ImageProcessor = {
  process: async () => {
    throw new Error('No image is processed in this test.')
  },
}

afterEach(() => {
  while (cleanupTasks.length > 0) {
    cleanupTasks.pop()?.()
  }

  useAppUiStore.setState({ activeNoteId: null, lockModalNoteId: null })
})

async function createApp(): Promise<{
  repositories: Repositories
  viewModel: () => LockModalViewModel
}> {
  databaseCounter += 1
  const repositories = await createRepositories({
    runtime: 'browser',
    databaseName: `lock-recovery-${databaseCounter}`,
    userId: 'local_user',
    deviceId: 'test_device',
    imageProcessor: unusedImageProcessor,
  })
  let current: LockModalViewModel | null = null

  function Probe() {
    current = useLockModalViewModel()
    return null
  }

  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <RepositoryProvider
        imageRepository={repositories.imageRepository}
        repository={repositories.noteRepository}
      >
        <Probe />
      </RepositoryProvider>,
    )
  })

  cleanupTasks.push(() => {
    act(() => root.unmount())
    container.remove()
  })

  return {
    repositories,
    viewModel: () => {
      if (!current) throw new Error('The view model has not rendered.')
      return current
    },
  }
}

async function openLockModalFor(app: Awaited<ReturnType<typeof createApp>>, noteId: string) {
  await act(async () => {
    useAppUiStore.setState({ lockModalNoteId: noteId as never })
  })

  // Let the note's live query deliver, so the modal knows it is locking.
  for (let tick = 0; tick < 5 && !app.viewModel().note; tick += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

describe('first lock on a fresh device', () => {
  it('holds the dialog on the recovery key the new vault was given', async () => {
    const app = await createApp()
    const noteId = await app.repositories.noteRepository.createNote({ title: 'Diary' })
    await openLockModalFor(app, noteId)
    expect(app.viewModel().mode).toBe('lock')

    await act(async () => {
      await app.viewModel().submit({ masterPassword })
    })

    expect(app.viewModel().error).toBeNull()
    expect(app.viewModel().recoveryKey).toMatch(/^([0-9A-Z]{5}-){7}[0-9A-Z]{5}$/)
    expect(useAppUiStore.getState().lockModalNoteId).toBe(noteId)
    expect((await app.repositories.noteRepository.getNote(noteId))?.isLocked).toBe(true)

    // The key shown is the vault's real key: it opens the note.
    const recoveryKey = app.viewModel().recoveryKey as string
    await expect(
      app.repositories.noteRepository.unlockNoteForSession(noteId, { recoveryKey }),
    ).resolves.toMatchObject({ noteId })
  })

  it('reports a wrong password at unlock instead of staying silent', async () => {
    const app = await createApp()
    const noteId = await app.repositories.noteRepository.createNote({ title: 'Diary' })
    await app.repositories.noteRepository.lockNote(noteId, { masterPassword })
    await openLockModalFor(app, noteId)
    expect(app.viewModel().mode).toBe('unlock')

    await act(async () => {
      await app.viewModel().submit({ masterPassword: 'not the password at all' })
    })

    expect(app.viewModel().error?.kind).toBe('wrong-password')
    expect(useAppUiStore.getState().lockModalNoteId).toBe(noteId)
    expect((await app.repositories.noteRepository.getNote(noteId))?.isLocked).toBe(true)
  })
})
