import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  backupFileName,
  createBackup,
  describeBackup,
  documentToMarkdown,
  libraryToMarkdown,
  parseBackupBundle,
  restoreBackup,
} from '@/backup'
import { createDexieNotesStore } from '@/local-store/dexie/dexie-notes-store'
import { DefaultNoteRepository } from '@/repository/note-repository'
import type { NoteDocument } from '@/shared/contracts'

const masterPassword = 'correct horse battery staple'
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

function createRepository() {
  databaseCounter += 1
  return new DefaultNoteRepository({
    localStore: createDexieNotesStore({ databaseName: `backup-${databaseCounter}` }),
    userId: 'local_user',
    deviceId: 'test_device',
  })
}

/** Round-trips through JSON the way a downloaded file would. */
function throughFile(bundle: unknown): unknown {
  return JSON.parse(JSON.stringify(bundle))
}

describe('backup bundle', () => {
  let repository: DefaultNoteRepository

  beforeEach(() => {
    repository = createRepository()
  })

  it('captures notes, folders and their placement', async () => {
    const folderId = await repository.createFolder({ name: 'Work' })
    const noteId = await repository.createNote({
      title: 'Report',
      document: documentWithText('quarterly numbers'),
    })
    await repository.moveNoteToFolder(noteId, folderId)
    await repository.createNote({ title: 'Loose note' })

    const bundle = await createBackup({ noteRepository: repository })

    expect(describeBackup(bundle)).toMatchObject({ folders: 1, notes: 2, lockedNotes: 0 })
    const report = bundle.notes.find((note) => note.id === noteId)
    expect(report?.parentFolderId).toBe(folderId)
  })

  it('restores a library into an empty install', async () => {
    const folderId = await repository.createFolder({ name: 'Work' })
    const noteId = await repository.createNote({
      title: 'Report',
      document: documentWithText('quarterly numbers'),
    })
    await repository.moveNoteToFolder(noteId, folderId)
    const bundle = await createBackup({ noteRepository: repository })

    const restored = createRepository()
    const report = await restoreBackup(
      { noteRepository: restored },
      throughFile(bundle),
    )

    expect(report).toMatchObject({ foldersAdded: 1, notesAdded: 1, notesSkipped: 0 })
    const note = await restored.getNote(noteId)
    expect(note?.isLocked).toBe(false)
    expect(note?.isLocked === false ? note.title : null).toBe('Report')
    expect(note?.parentFolderId).toBe(folderId)
  })

  it('keeps locked notes encrypted in the file and openable after restore', async () => {
    const secret = 'the codeword is zarnitsa'
    const noteId = await repository.createNote({
      title: 'Journal',
      document: documentWithText(secret),
    })
    const { recoveryKey } = await repository.lockNote(noteId, { masterPassword })

    const bundle = await createBackup({ noteRepository: repository })
    const serialized = JSON.stringify(bundle)

    // The whole point of a backup you can store anywhere: no plaintext in it.
    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain('Journal')
    expect(describeBackup(bundle)).toMatchObject({ lockedNotes: 1 })
    expect(bundle.cryptoProfile).not.toBeNull()

    const restored = createRepository()
    await restoreBackup({ noteRepository: restored }, throughFile(bundle))

    // Both ways in survive the round trip.
    await expect(
      restored.unlockNoteForSession(noteId, { masterPassword }),
    ).resolves.toMatchObject({ noteId })

    const viaRecovery = createRepository()
    await restoreBackup({ noteRepository: viaRecovery }, throughFile(bundle))
    await expect(
      viaRecovery.unlockNoteForSession(noteId, { recoveryKey: recoveryKey as string }),
    ).resolves.toMatchObject({ noteId })
  })

  it('never overwrites a note that already exists locally', async () => {
    const noteId = await repository.createNote({
      title: 'Original',
      document: documentWithText('from the backup'),
    })
    const bundle = await createBackup({ noteRepository: repository })

    await repository.updateNote(noteId, { title: 'Edited after the backup' })
    const report = await restoreBackup({ noteRepository: repository }, throughFile(bundle))

    expect(report).toMatchObject({ notesAdded: 0, notesSkipped: 1 })
    const note = await repository.getNote(noteId)
    expect(note?.isLocked === false ? note.title : null).toBe('Edited after the backup')
  })

  it('does not strand existing locked notes by importing a foreign crypto profile', async () => {
    const noteId = await repository.createNote({ title: 'Mine' })
    await repository.lockNote(noteId, { masterPassword })
    const localProfileBundle = await createBackup({ noteRepository: repository })

    const other = createRepository()
    const otherNoteId = await other.createNote({ title: 'Theirs' })
    await other.lockNote(otherNoteId, { masterPassword: 'a completely different one' })
    const foreign = await createBackup({ noteRepository: other })

    const report = await restoreBackup({ noteRepository: repository }, throughFile(foreign))

    expect(report.cryptoProfileRestored).toBe(false)
    // The local vault still opens with its own password.
    await expect(
      repository.unlockNoteForSession(noteId, { masterPassword }),
    ).resolves.toMatchObject({ noteId })
    expect(localProfileBundle.cryptoProfile).not.toEqual(foreign.cryptoProfile)
  })

  it('rejects files that are not backups, with a message a user can act on', async () => {
    expect(() => parseBackupBundle({ hello: 'world' })).toThrow(/not an Umbra Silico backup/)
    expect(() => parseBackupBundle({ format: 'umbra-silico.backup', version: 99 })).toThrow(
      /incompatible version/,
    )
  })

  it('names the file after the day it was taken', () => {
    expect(backupFileName('2026-07-27T10:20:30.000Z')).toBe(
      'umbra-silico-backup-2026-07-27.json',
    )
  })
})

describe('markdown export', () => {
  it('renders the block types the editor can produce', () => {
    const markdown = documentToMarkdown({
      schemaVersion: 1,
      editor: 'tiptap',
      content: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Plan' }] },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Ship ' },
              { type: 'text', text: 'today', marks: [{ type: 'bold' }] },
            ],
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }],
              },
            ],
          },
          {
            type: 'taskList',
            content: [
              { type: 'taskItem', attrs: { checked: true }, content: [{ type: 'text', text: 'Done' }] },
            ],
          },
        ],
      },
    })

    expect(markdown).toContain('## Plan')
    expect(markdown).toContain('Ship **today**')
    expect(markdown).toContain('- First')
    expect(markdown).toContain('- [x] Done')
  })

  it('marks locked notes instead of pretending they are empty', async () => {
    const repository = createRepository()
    const noteId = await repository.createNote({
      title: 'Journal',
      document: documentWithText('secret'),
    })
    await repository.lockNote(noteId, { masterPassword })
    const { notes, folders } = await repository.readBackupData()

    const markdown = libraryToMarkdown(notes, folders, '2026-07-27T00:00:00.000Z')

    expect(markdown).toContain('## Locked note')
    expect(markdown).toContain('This note is encrypted')
    expect(markdown).not.toContain('secret')
  })

  it('leaves trashed notes out of the readable export', async () => {
    const repository = createRepository()
    const keep = await repository.createNote({ title: 'Keep', document: documentWithText('a') })
    const drop = await repository.createNote({ title: 'Drop', document: documentWithText('b') })
    await repository.deleteNote(drop)
    const { notes, folders } = await repository.readBackupData()

    const markdown = libraryToMarkdown(notes, folders, '2026-07-27T00:00:00.000Z')

    expect(markdown).toContain('## Keep')
    expect(markdown).not.toContain('## Drop')
    expect(keep).toBeTruthy()
  })
})
