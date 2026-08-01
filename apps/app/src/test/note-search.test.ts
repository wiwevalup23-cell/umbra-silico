import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDexieNotesStore } from '@/local-store/dexie/dexie-notes-store'
import { DefaultNoteRepository } from '@/repository/note-repository'
import type { NoteDocument } from '@/shared/contracts'

let databaseCounter = 0

function documentWithText(text: string): NoteDocument {
  return {
    schemaVersion: 1,
    editor: 'tiptap',
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    },
  }
}

async function settle(): Promise<void> {
  for (let tick = 0; tick < 5; tick += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe('note search', () => {
  let repository: DefaultNoteRepository

  beforeEach(() => {
    databaseCounter += 1
    repository = new DefaultNoteRepository({
      localStore: createDexieNotesStore({ databaseName: `note-search-${databaseCounter}` }),
      userId: 'local_user',
      deviceId: 'test_device',
    })
  })

  async function search(term: string): Promise<string[]> {
    const query = repository.liveNoteList({ search: term })
    await settle()
    const titles = query.getSnapshot().map((note) => note.title)
    query.dispose()
    return titles
  }

  it('finds a word that lives past the preview cut-off', async () => {
    const filler = 'lorem ipsum filler text to push the needle out of preview range. '.repeat(8)
    await repository.createNote({
      title: 'Long note',
      document: documentWithText(`${filler} the codeword is zarnitsa.`),
    })
    await repository.createNote({ title: 'Short note' })

    expect(await search('zarnitsa')).toEqual(['Long note'])
  })

  it('still matches titles and tags', async () => {
    await repository.createNote({
      title: 'Trip planning',
      properties: { kind: 'standard', status: 'none', tags: ['Reisen'] },
    })
    await repository.createNote({ title: 'Groceries' })

    expect(await search('trip')).toEqual(['Trip planning'])
    expect(await search('reisen')).toEqual(['Trip planning'])
    expect(await search('groc')).toEqual(['Groceries'])
  })

  it('drops a locked note out of body search but finds it again while unlocked', async () => {
    const secret = 'zarnitsa'
    const noteId = await repository.createNote({
      title: 'Journal',
      document: documentWithText(`the codeword is ${secret}`),
    })
    expect(await search(secret)).toEqual(['Journal'])

    await repository.lockNote(noteId, { masterPassword: 'correct horse battery staple' })

    // Ciphertext is not searchable, and the title is hidden as well.
    expect(await search(secret)).toEqual([])
    expect(await search('journal')).toEqual([])

    await repository.unlockNoteForSession(noteId, {
      masterPassword: 'correct horse battery staple',
    })

    // An active unlock session is matched from memory, never from the row.
    expect(await search(secret)).toEqual(['Journal'])
  })

  it('narrows results as the term grows and restores them when cleared', async () => {
    await repository.createNote({ title: 'Alpha', document: documentWithText('shared word') })
    await repository.createNote({ title: 'Beta', document: documentWithText('shared word') })

    expect((await search('shared')).sort()).toEqual(['Alpha', 'Beta'])
    expect(await search('alpha')).toEqual(['Alpha'])
    expect((await search('')).sort()).toEqual(['Alpha', 'Beta'])
  })

  it('keeps search scoped to the requested folder', async () => {
    const folderId = await repository.createFolder({ name: 'Work' })
    const workNote = await repository.createNote({
      title: 'Work note',
      document: documentWithText('shared word'),
    })
    await repository.moveNoteToFolder(workNote, folderId)
    await repository.createNote({
      title: 'Home note',
      document: documentWithText('shared word'),
    })

    const scoped = repository.liveNoteList({ folderId, search: 'shared' })
    await settle()

    expect(scoped.getSnapshot().map((note) => note.title)).toEqual(['Work note'])
    scoped.dispose()
  })
})
