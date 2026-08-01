import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  formatRecoveryKey,
  generateRecoveryKey,
  isPlausibleRecoveryKey,
  normalizeRecoveryKey,
} from '@/crypto'
import { createDexieNotesStore } from '@/local-store/dexie/dexie-notes-store'
import { DefaultNoteRepository } from '@/repository/note-repository'
import type { NoteDocument } from '@/shared/contracts'

const masterPassword = 'correct horse battery staple'

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

describe('recovery key format', () => {
  it('generates transcribable, high-entropy keys', () => {
    const key = generateRecoveryKey()

    expect(key).toMatch(/^([0-9A-Z]{5}-){7}[0-9A-Z]{5}$/)
    expect(isPlausibleRecoveryKey(key)).toBe(true)
    // 25 random bytes; two draws colliding would mean the RNG is broken.
    expect(generateRecoveryKey()).not.toBe(key)
  })

  it('folds the characters a person is most likely to mistype', () => {
    // O/0, I/1, L/1 and U/V are the pairs the alphabet deliberately avoids.
    expect(normalizeRecoveryKey('o1lu')).toBe('011V')
    expect(normalizeRecoveryKey(' ab-cd ef ')).toBe('ABCDEF')
    expect(formatRecoveryKey('ABCDEFGHIJ')).toBe('ABCDE-FGH1J')
  })

  it('rejects a truncated key without attempting a decrypt', () => {
    expect(isPlausibleRecoveryKey('ABCDE')).toBe(false)
    expect(isPlausibleRecoveryKey('')).toBe(false)
  })
})

describe('recovery key unlock', () => {
  let databaseCounter = 0
  let repository: DefaultNoteRepository

  beforeEach(() => {
    databaseCounter += 1
    repository = new DefaultNoteRepository({
      localStore: createDexieNotesStore({ databaseName: `recovery-${databaseCounter}` }),
      userId: 'local_user',
      deviceId: 'test_device',
    })
  })

  it('hands out a recovery key when the vault is created, and only then', async () => {
    const first = await repository.createNote({ title: 'One' })
    const second = await repository.createNote({ title: 'Two' })

    const firstLock = await repository.lockNote(first, { masterPassword })
    expect(firstLock.recoveryKey).toBeTruthy()

    // The vault already exists, so a later lock has nothing new to reveal.
    const secondLock = await repository.lockNote(second, { masterPassword })
    expect(secondLock.recoveryKey).toBeNull()
  })

  it('opens a locked note with the recovery key instead of the password', async () => {
    const noteId = await repository.createNote({
      title: 'Journal',
      document: documentWithText('the codeword is zarnitsa'),
    })
    const { recoveryKey } = await repository.lockNote(noteId, { masterPassword })
    expect(recoveryKey).toBeTruthy()
    expect((await repository.getNote(noteId))?.isLocked).toBe(true)

    const session = await repository.unlockNoteForSession(noteId, {
      recoveryKey: recoveryKey as string,
    })

    expect(session.noteId).toBe(noteId)

    // Plaintext lives in the unlock session, not on the stored row, so it is
    // observed through the live query rather than the raw read.
    const live = repository.liveNote(noteId)
    for (let tick = 0; tick < 5; tick += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    const unlocked = live.getSnapshot()
    expect(unlocked?.isLocked).toBe(false)
    expect(unlocked?.isLocked === false ? unlocked.preview : null).toBe(
      'the codeword is zarnitsa',
    )
    live.dispose()
  })

  it('accepts a key retyped without its dashes or with look-alike characters', async () => {
    const noteId = await repository.createNote({
      title: 'Journal',
      document: documentWithText('secret'),
    })
    const { recoveryKey } = await repository.lockNote(noteId, { masterPassword })
    const retyped = (recoveryKey as string).replace(/-/g, '').replace(/0/g, 'O')

    await expect(
      repository.unlockNoteForSession(noteId, { recoveryKey: retyped }),
    ).resolves.toMatchObject({ noteId })
  })

  it('refuses a wrong recovery key', async () => {
    const noteId = await repository.createNote({ title: 'Journal' })
    await repository.lockNote(noteId, { masterPassword })

    await expect(
      repository.unlockNoteForSession(noteId, { recoveryKey: generateRecoveryKey() }),
    ).rejects.toThrow()

    // A failed attempt must not leave the note readable.
    expect((await repository.getNote(noteId))?.isLocked).toBe(true)
  })

  it('still opens with the master password after a recovery unlock', async () => {
    const noteId = await repository.createNote({ title: 'Journal' })
    const { recoveryKey } = await repository.lockNote(noteId, { masterPassword })

    await repository.unlockNoteForSession(noteId, { recoveryKey: recoveryKey as string })
    await repository.lockNote(noteId, { masterPassword })

    await expect(
      repository.unlockNoteForSession(noteId, { masterPassword }),
    ).resolves.toMatchObject({ noteId })
  })
})
