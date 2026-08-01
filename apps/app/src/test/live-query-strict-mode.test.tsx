import 'fake-indexeddb/auto'
import { StrictMode, useEffect, useState } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { createDexieNotesStore } from '@/local-store/dexie/dexie-notes-store'
import { DefaultNoteRepository } from '@/repository/note-repository'
import type { NoteRepository } from '@/repository/contracts'
import { useLiveQuery, useOwnedLiveQuery } from '@/viewmodel/live-query-view-model'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let databaseCounter = 0
let container: HTMLDivElement | null = null
let root: Root | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

function createRepository() {
  databaseCounter += 1
  return new DefaultNoteRepository({
    localStore: createDexieNotesStore({ databaseName: `strict-mode-${databaseCounter}` }),
    userId: 'local_user',
    deviceId: 'test_device',
  })
}

async function settle(): Promise<void> {
  for (let tick = 0; tick < 6; tick += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

function NoteTitles({ repository }: { repository: NoteRepository }) {
  const query = useOwnedLiveQuery(() => repository.liveNoteList(), [repository])
  const notes = useLiveQuery(query)

  return <ul>{notes.map((note) => <li key={note.id}>{note.title}</li>)}</ul>
}

function render(element: React.ReactElement) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root?.render(<StrictMode>{element}</StrictMode>))
}

describe('owned live queries under StrictMode', () => {
  it('still shows stored notes after the double mount', async () => {
    const repository = createRepository()
    await repository.createNote({ title: 'Already here' })

    // StrictMode mounts, tears down and remounts every effect. A query that is
    // released on that first teardown must not leave the list permanently
    // empty on the remount.
    render(<NoteTitles repository={repository} />)
    await settle()

    expect(container?.textContent).toContain('Already here')
  })

  it('keeps reacting to writes after the double mount', async () => {
    const repository = createRepository()
    render(<NoteTitles repository={repository} />)
    await settle()

    await act(async () => {
      await repository.createNote({ title: 'Added later' })
    })
    await settle()

    expect(container?.textContent).toContain('Added later')
  })

  it('releases the query when the component really unmounts', async () => {
    const repository = createRepository()

    function Toggle() {
      const [visible, setVisible] = useState(true)

      useEffect(() => {
        setVisible(false)
      }, [])

      return visible ? <NoteTitles repository={repository} /> : <p>gone</p>
    }

    render(<Toggle />)
    await settle()
    expect(container?.textContent).toBe('gone')

    // Nothing is watching any more, so a later write must not resurrect a
    // registration and keep re-reading the store forever.
    await act(async () => {
      await repository.createNote({ title: 'After unmount' })
    })
    await settle()

    expect(container?.textContent).toBe('gone')
  })
})
