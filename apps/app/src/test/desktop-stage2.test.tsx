import 'fake-indexeddb/auto'
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import { createDexieDatabase } from '@/local-store/dexie/dexie-db'
import { DexieNotesStore } from '@/local-store/dexie/dexie-notes-store'
import { DefaultNoteRepository } from '@/repository'
import { deviceIdSchema, userIdSchema, folderIdSchema, type FolderTreeNode } from '@/shared/contracts'
import { RepositoryContext } from '@/viewmodel/repository-context'
import { useNoteLocation } from '@/viewmodel/note-location-view-model'
import { FolderTree } from '@/ui/components/notes/FolderTree'
import { noteDragType } from '@/ui/components/notes/note-drag'
import { MoveToFolderDialog } from '@/ui/components/notes/MoveToFolderDialog'
import { TranslationProvider } from '@/ui/i18n/TranslationProvider'
import { EditorToolbar } from '@/ui/editor/toolbar/EditorToolbar'
import { createNoteEditorExtensions } from '@/ui/editor/extensions'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const cleanups: Array<() => void | Promise<void>> = []
function render(content: ReactNode) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const rerender = (node: ReactNode) => act(() => root.render(<TranslationProvider locale="ru">{node}</TranslationProvider>))
  rerender(content)
  cleanups.push(() => { act(() => root.unmount()); container.remove() })
  return { container, rerender }
}
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.()
  localStorage.removeItem('umbra.folder-expansion.v1')
  vi.restoreAllMocks()
})
const userId = userIdSchema.parse('stage2_user')
const deviceId = deviceIdSchema.parse('stage2_device')
function folder(id: string, children: FolderTreeNode[] = []): FolderTreeNode {
  return { children, noteCount: 0, folder: {
    id: folderIdSchema.parse(id), name: id, parentFolderId: null,
    createdAt: '2026-09-20T10:00:00Z', updatedAt: '2026-09-20T10:00:00Z',
    deletedAt: null, localRevision: 1, sortIndex: 0, syncStatus: 'dirty', deviceId, userId,
  } }
}
const tree = [folder('A', [folder('B', [folder('C', [folder('D')])])]),
  ...Array.from({ length: 30 }, (_, i) => folder(`Other ${i}`))]
const treeProps = {
  nodes: tree, activeFolderId: undefined, onCreateFolder: vi.fn(), onDeleteFolder: vi.fn(),
  onMoveNoteToFolder: vi.fn(), onRenameFolder: vi.fn(), onSelectFolder: vi.fn(),
}
it('preserves nested expansion across unmounts and reveals the selected ancestor path', () => {
  const h = render(<FolderTree {...treeProps} />)
  const twisty = (name: string) => Array.from(h.container.querySelectorAll('.sn-folder-tree__row'))
    .find((row) => row.querySelector('.sn-folder-tree__select span')?.textContent === name)!
    .querySelector<HTMLButtonElement>('.sn-folder-tree__twisty')!
  act(() => twisty('B').click())
  act(() => twisty('A').click())
  act(() => twisty('A').click())
  expect(twisty('B').getAttribute('aria-expanded')).toBe('false')
  h.rerender(null)
  h.rerender(<FolderTree {...treeProps} />)
  expect(twisty('B').getAttribute('aria-expanded')).toBe('false')
  h.rerender(<FolderTree {...treeProps} activeFolderId={folderIdSchema.parse('D')} />)
  expect(twisty('B').getAttribute('aria-expanded')).toBe('true')
  expect(twisty('C').getAttribute('aria-expanded')).toBe('true')
  expect(h.container.querySelectorAll('.sn-folder-tree__row')).toHaveLength(34)
})

it('excludes a moving folder and descendants and shows unambiguous destination paths', async () => {
  const move = vi.fn(async () => undefined)
  const h = render(<MoveToFolderDialog currentFolderId={null} folders={tree}
    movingFolderId={folderIdSchema.parse('B')} noteTitle="B" onCancel={vi.fn()} onMove={move} />)
  const buttons = Array.from(h.container.querySelectorAll<HTMLButtonElement>('.sn-move-folder-list button'))
  expect(buttons.map((button) => button.textContent)).toContain('A')
  expect(buttons.some((button) => button.textContent?.includes(' / B'))).toBe(false)
  await act(async () => buttons.find((button) => button.textContent === 'Other 29')!.click())
  expect(move).toHaveBeenCalledWith('Other 29')
  h.rerender(<MoveToFolderDialog currentFolderId={null} folders={tree} noteTitle="Note" onCancel={vi.fn()} onMove={move} />)
  expect(h.container.textContent).toContain('A / B / C / D')
})

it('reports failed moves inside the dialog and allows retry', async () => {
  const move = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
  const h = render(<MoveToFolderDialog currentFolderId={null} folders={[folder('A')]}
    noteTitle="Note" onCancel={vi.fn()} onMove={move} />)
  const target = h.container.querySelector<HTMLButtonElement>('.sn-move-folder-list button:last-child')!
  await act(async () => target.click())
  expect(h.container.querySelector('[role="alert"]')).not.toBeNull()
  expect(target.disabled).toBe(false)
  await act(async () => target.click())
  expect(move).toHaveBeenCalledTimes(2)
  expect(h.container.querySelector('[role="alert"]')).toBeNull()
})

async function locationHarness() {
  const db = createDexieDatabase(`stage2_${crypto.randomUUID()}`)
  const repository = new DefaultNoteRepository({ localStore: new DexieNotesStore({ database: db }), userId, deviceId })
  cleanups.push(async () => { db.close(); await db.delete() })
  let model: ReturnType<typeof useNoteLocation>
  function Probe() { model = useNoteLocation(); return null }
  render(<RepositoryContext value={repository}><Probe /></RepositoryContext>)
  const noteId = await repository.createNote({ title: 'Test note' })
  const folderId = await repository.createFolder({ name: 'Destination' })
  return { repository, noteId, folderId, get model() { return model! } }
}
it('moves and undoes against the repository; also restores trash without losing content', async () => {
  const h = await locationHarness()
  await act(async () => { expect(await h.model.move(h.noteId, h.folderId)).toBe(true) })
  expect(h.model.receipt?.destination).toBe(h.folderId)
  expect((await h.repository.getNote(h.noteId))?.parentFolderId).toBe(h.folderId)
  await act(async () => { await h.model.undo() })
  expect((await h.repository.getNote(h.noteId))?.parentFolderId).toBeNull()
  await act(async () => { await h.model.trash(h.noteId) })
  expect((await h.repository.getNote(h.noteId))?.deletedAt).not.toBeNull()
  await act(async () => { await h.model.undo() })
  expect((await h.repository.getNote(h.noteId))?.deletedAt).toBeNull()
  expect((await h.repository.getNote(h.noteId))?.title).toBe('Test note')
})

it('routes a note drop through persistence and exposes its reversible destination', async () => {
  const h = await locationHarness()
  let pendingMove: Promise<boolean> | undefined
  const target = folder(h.folderId)
  const rendered = render(<FolderTree {...treeProps} nodes={[target]}
    onMoveNoteToFolder={(noteId, folderId) => {
      pendingMove = h.model.move(noteId, folderId)
    }} />)
  const drop = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(drop, 'dataTransfer', {
    value: { getData: (type: string) => type === noteDragType ? h.noteId : '' },
  })
  await act(async () => {
    rendered.container.querySelector('.sn-folder-tree__row')!.dispatchEvent(drop)
    expect(await pendingMove).toBe(true)
  })
  expect(drop.defaultPrevented).toBe(true)
  expect(h.model.receipt?.destination).toBe(h.folderId)
  expect((await h.repository.getNote(h.noteId))?.parentFolderId).toBe(h.folderId)
  await act(async () => { await h.model.undo() })
  expect((await h.repository.getNote(h.noteId))?.parentFolderId).toBeNull()
})

it('keeps a move dialog open and prevents duplicate submission while saving', async () => {
  let finish!: () => void
  const move = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
  const cancel = vi.fn()
  const rendered = render(<MoveToFolderDialog currentFolderId={null} folders={[folder('A')]}
    noteTitle="Note" onCancel={cancel} onMove={move} />)
  const target = rendered.container.querySelector<HTMLButtonElement>('.sn-move-folder-list button:last-child')!
  act(() => target.click())
  expect(target.disabled).toBe(true)
  act(() => target.click())
  expect(move).toHaveBeenCalledOnce()
  const escape = new Event('cancel', { cancelable: true })
  act(() => rendered.container.querySelector('dialog')!.dispatchEvent(escape))
  expect(escape.defaultPrevented).toBe(true)
  expect(cancel).not.toHaveBeenCalled()
  await act(async () => finish())
  expect(target.disabled).toBe(false)
})

it('does not undo over a newer location and does not report success after failed writes', async () => {
  const h = await locationHarness()
  await act(async () => { await h.model.move(h.noteId, h.folderId) })
  await h.repository.moveNoteToFolder(h.noteId, null)
  await act(async () => { expect(await h.model.undo()).toBe(false) })
  expect(h.model.error).toBe(true)
  act(() => h.model.dismiss())
  vi.spyOn(h.repository, 'moveNoteToFolder').mockRejectedValueOnce(new Error('write failed'))
  await act(async () => { expect(await h.model.move(h.noteId, h.folderId)).toBe(false) })
  expect(h.model.receipt).toBeNull()
  expect(h.model.error).toBe(true)
})

it('moves a whole folder subtree and retains its notes, refusing cycles', async () => {
  const h = await locationHarness()
  const child = await h.repository.createFolder({ name: 'Child', parentFolderId: h.folderId })
  const target = await h.repository.createFolder({ name: 'Target' })
  await h.repository.moveNoteToFolder(h.noteId, child)
  await h.repository.moveFolder(h.folderId, target)
  const query = h.repository.liveFolderTree()
  await query.refresh()
  expect(query.getSnapshot().find((n) => n.folder.id === target)?.children[0].children[0].folder.id).toBe(child)
  expect((await h.repository.getNote(h.noteId))?.parentFolderId).toBe(child)
  await expect(h.repository.moveFolder(target, child)).rejects.toThrow()
  query.dispose()
})

it.each(['Выноска', 'Раскрывающийся блок', 'Маркированный список'])(
  'inserts %s from the separate insert panel without opening spacing settings', (label) => {
    const editor = new Editor({ content: '<p>Example</p>', extensions: createNoteEditorExtensions({ onEditMath: vi.fn() }) })
    cleanups.push(() => editor.destroy())
    const h = render(<EditorToolbar editor={editor} onOpenMath={vi.fn()} />)
    act(() => h.container.querySelector<HTMLButtonElement>('button[aria-label="Вставить"]')!.click())
    const panel = document.querySelector('#sn-editor-insert')!
    expect(panel.querySelector('input')).toBeNull()
    const button = Array.from(panel.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.includes(label))!
    expect(button).toBeDefined()
    act(() => button.click())
    expect(editor.getJSON().content?.[0].type).toBe(label === 'Выноска' ? 'callout' : label === 'Раскрывающийся блок' ? 'details' : 'bulletList')
  },
)
