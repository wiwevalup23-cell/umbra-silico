import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDexieNotesStore } from '@/local-store/dexie/dexie-notes-store'
import { DefaultNoteRepository } from '@/repository/note-repository'
import { LiveQueryRegistry, StoreBackedLiveQuery } from '@/repository/live-query'
import type { NoteId } from '@/shared/contracts'

let databaseCounter = 0

function createRepository() {
  databaseCounter += 1
  return new DefaultNoteRepository({
    localStore: createDexieNotesStore({
      databaseName: `live-query-lifecycle-${databaseCounter}`,
    }),
    userId: 'local_user',
    deviceId: 'test_device',
  })
}

/** Lets a live query's constructor-time refresh settle before assertions. */
async function flush(): Promise<void> {
  // Dexie resolves across several macrotasks, so a single tick can leave the
  // constructor refresh in flight and leak an extra notification into a test.
  for (let tick = 0; tick < 5; tick += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe('live query lifecycle', () => {
  let repository: DefaultNoteRepository
  let noteId: NoteId

  beforeEach(async () => {
    repository = createRepository()
    noteId = await repository.createNote({ title: 'First note' })
  })

  it('stops serving a query once it is disposed', async () => {
    const query = repository.liveNoteList()
    await flush()
    expect(query.getSnapshot()).toHaveLength(1)

    query.dispose()
    await repository.createNote({ title: 'Second note' })
    await flush()

    // A disposed query must neither update nor be re-read by the repository.
    expect(query.getSnapshot()).toHaveLength(1)
  })

  it('does not notify listeners of a query disposed mid-flight', async () => {
    const query = repository.liveNoteList()
    await flush()

    let notifications = 0
    query.subscribe(() => {
      notifications += 1
    })

    const pending = repository.createNote({ title: 'Second note' })
    query.dispose()
    await pending
    await flush()

    expect(notifications).toBe(0)
  })

  it('refreshes only the queries a mutation can have changed', async () => {
    const refreshed: string[] = []
    const registry = new LiveQueryRegistry()
    const track = (name: string, tags: Array<'notes' | 'trash' | 'folders'>) => {
      const query = new StoreBackedLiveQuery<number>({
        initialSnapshot: 0,
        loadSnapshot: async () => {
          refreshed.push(name)
          return 0
        },
        onDispose: (disposed) => registry.unregister(disposed),
        tags,
      })
      registry.register(query)
      return query
    }

    track('notes', ['notes'])
    track('trash', ['trash'])
    track('folders', ['folders'])
    await flush()
    refreshed.length = 0

    await registry.invalidate(['notes'])

    expect(refreshed).toEqual(['notes'])
  })

  it('leaves the folder tree alone when a note is only retitled', async () => {
    const folderTree = repository.liveFolderTree()
    const notes = repository.liveNoteList()
    await flush()

    let folderRefreshes = 0
    let noteRefreshes = 0
    folderTree.subscribe(() => {
      folderRefreshes += 1
    })
    notes.subscribe(() => {
      noteRefreshes += 1
    })

    await repository.updateNote(noteId, { title: 'Renamed' })
    await flush()

    expect(noteRefreshes).toBe(1)
    // Folder note counts cannot change when the note stayed where it was.
    expect(folderRefreshes).toBe(0)

    folderTree.dispose()
    notes.dispose()
  })

  it('does refresh the folder tree when a note moves between folders', async () => {
    const folderId = await repository.createFolder({ name: 'Archive' })
    const folderTree = repository.liveFolderTree()
    await flush()

    let folderRefreshes = 0
    folderTree.subscribe(() => {
      folderRefreshes += 1
    })

    await repository.moveNoteToFolder(noteId, folderId)
    await flush()

    expect(folderRefreshes).toBe(1)
    folderTree.dispose()
  })

  it('keeps the snapshot identity when a refresh finds no change', async () => {
    const notes = repository.liveNoteList()
    await flush()
    const before = notes.getSnapshot()
    expect(before).toHaveLength(1)

    // A refresh that reads identical data must not hand React a fresh array,
    // or every unrelated invalidation would re-render the whole library.
    await notes.refresh()

    expect(notes.getSnapshot()).toBe(before)
    notes.dispose()
  })

  it('publishes a new snapshot when the list content actually changes', async () => {
    const notes = repository.liveNoteList()
    await flush()
    const before = notes.getSnapshot()

    await repository.updateNote(noteId, { title: 'Renamed' })
    await flush()

    expect(notes.getSnapshot()).not.toBe(before)
    expect(notes.getSnapshot()[0]?.title).toBe('Renamed')
    notes.dispose()
  })
})
