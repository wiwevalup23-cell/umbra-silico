import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDexieNotesStore } from '@/local-store/dexie/dexie-notes-store'
import { DefaultNoteRepository } from '@/repository/note-repository'
import {
  defaultNoteHistoryRetention,
  selectExpiredNoteOps,
} from '@/repository/note-history'
import {
  deviceIdSchema,
  noteIdSchema,
  operationIdSchema,
  userIdSchema,
  type NoteDocument,
  type SyncOperation,
} from '@/shared/contracts'

const hourMs = 60 * 60 * 1000
const dayMs = 24 * hourMs
const now = Date.parse('2026-07-20T12:00:00.000Z')

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

function makeOp(opId: string, ageMs: number): SyncOperation {
  return {
    opId: operationIdSchema.parse(opId),
    noteId: noteIdSchema.parse('note_history'),
    userId: userIdSchema.parse('user_history'),
    deviceId: deviceIdSchema.parse('device_history'),
    type: 'note.update',
    payload: { kind: 'note.snapshot', note: {} },
    baseRemoteRevision: null,
    createdAt: new Date(now - ageMs).toISOString(),
    attemptCount: 0,
    lastError: null,
    status: 'pending',
  }
}

describe('history retention policy', () => {
  const nowIso = new Date(now).toISOString()

  it('keeps everything inside the dense window', () => {
    const ops = [
      makeOp('op_1', 0),
      makeOp('op_2', hourMs),
      makeOp('op_3', 2 * hourMs),
      makeOp('op_4', 23 * hourMs),
    ]

    expect(selectExpiredNoteOps(ops, nowIso)).toEqual([])
  })

  it('thins older versions to one per hour, then one per day', () => {
    const ops = [
      makeOp('op_now', 0),
      // Three edits inside the same hour, two days back: one survives.
      makeOp('op_2d_a', 2 * dayMs),
      makeOp('op_2d_b', 2 * dayMs + 60_000),
      makeOp('op_2d_c', 2 * dayMs + 120_000),
      // Two edits inside the same day, ten days back: one survives.
      makeOp('op_10d_a', 10 * dayMs),
      makeOp('op_10d_b', 10 * dayMs + 3 * hourMs),
    ]

    const expired = selectExpiredNoteOps(ops, nowIso)

    expect(expired).toContain('op_2d_b')
    expect(expired).toContain('op_2d_c')
    expect(expired).toContain('op_10d_b')
    expect(expired).not.toContain('op_now')
    expect(expired).not.toContain('op_2d_a')
    expect(expired).not.toContain('op_10d_a')
  })

  it('drops everything past the daily window', () => {
    const ops = [makeOp('op_now', 0), makeOp('op_ancient', 90 * dayMs)]

    expect(selectExpiredNoteOps(ops, nowIso)).toEqual(['op_ancient'])
  })

  it('never drops the newest snapshot, however old it is', () => {
    // A note untouched for a year still needs its latest snapshot: it is what
    // a pending outbox would push once a remote is configured.
    const ops = [makeOp('op_only', 365 * dayMs)]

    expect(selectExpiredNoteOps(ops, nowIso)).toEqual([])
    expect(selectExpiredNoteOps([], nowIso)).toEqual([])
  })

  it('is configurable', () => {
    const ops = [makeOp('op_now', 0), makeOp('op_old', 2 * hourMs)]

    expect(
      selectExpiredNoteOps(ops, nowIso, {
        ...defaultNoteHistoryRetention,
        denseWindowMs: hourMs,
        hourlyWindowMs: hourMs,
        dailyWindowMs: hourMs,
      }),
    ).toEqual(['op_old'])
  })
})

describe('note version history', () => {
  let databaseCounter = 0
  let repository: DefaultNoteRepository

  beforeEach(() => {
    databaseCounter += 1
    repository = new DefaultNoteRepository({
      localStore: createDexieNotesStore({ databaseName: `note-history-${databaseCounter}` }),
      userId: 'local_user',
      deviceId: 'test_device',
    })
  })

  it('lists a version per edit, newest first, flagging the current one', async () => {
    const noteId = await repository.createNote({
      title: 'Draft',
      document: documentWithText('first'),
    })
    await repository.updateNote(noteId, { document: documentWithText('second') })
    await repository.updateNote(noteId, { title: 'Final' })

    const versions = await repository.listNoteVersions(noteId)

    expect(versions).toHaveLength(3)
    expect(versions[0]).toMatchObject({ title: 'Final', isCurrent: true, isLocked: false })
    expect(versions[1]).toMatchObject({ title: 'Draft', isCurrent: false })
    expect(versions[2]).toMatchObject({ changeType: 'note.create', isCurrent: false })
    expect(versions[1]?.preview).toBe('second')
  })

  it('restores an older version as a new revision that is itself undoable', async () => {
    const noteId = await repository.createNote({
      title: 'Recipe',
      document: documentWithText('two eggs'),
    })
    await repository.updateNote(noteId, { document: documentWithText('three eggs') })

    const versions = await repository.listNoteVersions(noteId)
    const original = versions.find((version) => version.preview === 'two eggs')
    expect(original).toBeDefined()

    await repository.restoreNoteVersion(noteId, original!.opId)

    const restored = await repository.getNote(noteId)
    expect(restored?.isLocked).toBe(false)
    expect(restored?.preview).toBe('two eggs')

    // The restore is a normal revision, so the state it replaced is still there.
    const afterRestore = await repository.listNoteVersions(noteId)
    expect(afterRestore).toHaveLength(3)
    expect(afterRestore[0]?.isCurrent).toBe(true)
    const undo = afterRestore.find((version) => version.preview === 'three eggs')
    expect(undo).toBeDefined()

    await repository.restoreNoteVersion(noteId, undo!.opId)
    expect((await repository.getNote(noteId))?.preview).toBe('three eggs')
  })

  it('refuses to restore a version that retention already dropped', async () => {
    const noteId = await repository.createNote({ title: 'Note' })

    await expect(repository.restoreNoteVersion(noteId, 'op_missing')).rejects.toThrow(
      /no longer available/,
    )
  })

  it('keeps a restore from resurrecting a deleted note', async () => {
    const noteId = await repository.createNote({
      title: 'Note',
      document: documentWithText('alive'),
    })
    await repository.updateNote(noteId, { document: documentWithText('edited') })
    const versions = await repository.listNoteVersions(noteId)
    const early = versions[versions.length - 1]
    await repository.deleteNote(noteId)

    await repository.restoreNoteVersion(noteId, early.opId)

    expect((await repository.getNote(noteId))?.deletedAt).not.toBeNull()
  })

  it('reclaims history instead of growing an op per save forever', async () => {
    const oldDay = Date.parse('2026-01-01T00:00:00.000Z')
    let clockValue = new Date(oldDay).toISOString()
    const aging = new DefaultNoteRepository({
      localStore: createDexieNotesStore({ databaseName: 'note-history-prune' }),
      userId: 'local_user',
      deviceId: 'test_device',
      clock: () => clockValue,
      // Re-evaluate on every write so the test does not depend on the shipped
      // cadence; the retention policy itself is what is under test here.
      historyPruneEveryWrites: 1,
    })

    const noteId = await aging.createNote({ title: 'Journal' })

    // Twenty-five saves a minute apart, all on the same long-past day.
    for (let index = 0; index < 25; index += 1) {
      clockValue = new Date(oldDay + index * 60_000).toISOString()
      await aging.updateNote(noteId, { document: documentWithText(`revision ${index}`) })
    }

    const beforePrune = await aging.listNoteVersions(noteId)
    expect(beforePrune.length).toBeGreaterThan(20)

    // Two months later a further save re-evaluates the whole history: those
    // same-hour revisions now collapse to a single daily survivor.
    clockValue = new Date(oldDay + 60 * dayMs).toISOString()
    await aging.updateNote(noteId, { document: documentWithText('latest') })

    const afterPrune = await aging.listNoteVersions(noteId)

    expect(afterPrune.length).toBeLessThan(beforePrune.length)
    expect(afterPrune[0]).toMatchObject({ isCurrent: true, preview: 'latest' })
  })
})
