import { useCallback, useEffect, useState } from 'react'
import { AppProviders } from '@/app/providers'
import { EditorShell } from '@/ui/components/notes/EditorShell'
import { FolderTree } from '@/ui/components/notes/FolderTree'
import { noteDragType } from '@/ui/components/notes/note-drag'
import { LockModal } from '@/ui/components/notes/LockModal'
import { NoteList } from '@/ui/components/notes/NoteList'
import { TrashView } from '@/ui/components/notes/TrashView'
import { WorkspaceInspector } from '@/ui/components/notes/WorkspaceInspector'
import { SettingsModal } from '@/ui/components/silicon/SettingsModal'
import { UiIcon } from '@/ui/icons/ui/UiIcon'
import type { NoteId } from '@/shared/contracts/note'
import {
  useActiveNoteViewModel,
  useFoldersViewModel,
  useLockModalViewModel,
  useNotesViewModel,
  useSyncViewModel,
  useTrashViewModel,
} from '@/viewmodel'
import { useSettings } from '@/viewmodel/useSettings'

type LibraryMode = 'notes' | 'trash'

export function App() {
  return (
    <AppProviders>
      <AppWorkspace />
    </AppProviders>
  )
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia(query)
    setMatches(mediaQuery.matches)

    const handler = (event: MediaQueryListEvent) => setMatches(event.matches)
    mediaQuery.addEventListener('change', handler)

    return () => mediaQuery.removeEventListener('change', handler)
  }, [query])

  return matches
}

function AppWorkspace() {
  const isCompact = useMediaQuery('(max-width: 1120px)')
  const isNarrow = useMediaQuery('(max-width: 820px)')
  const [searchQuery, setSearchQuery] = useState('')
  const [libraryMode, setLibraryMode] = useState<LibraryMode>('notes')
  const [isLibraryCollapsed, setLibraryCollapsed] = useState(false)
  const [isInspectorCollapsed, setInspectorCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(max-width: 1120px)').matches
  })
  const [isHomeView, setIsHomeView] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const foldersViewModel = useFoldersViewModel()
  const notesViewModel = useNotesViewModel({
    folderId: libraryMode === 'notes' ? foldersViewModel.activeFolderId : undefined,
    search: searchQuery,
  })
  const trashViewModel = useTrashViewModel()
  const activeNoteViewModel = useActiveNoteViewModel()
  const syncViewModel = useSyncViewModel()
  const lockModalViewModel = useLockModalViewModel()
  const { settings, updateSetting } = useSettings()

  const selectedNoteId = notesViewModel.activeNoteId
  const firstNoteId = notesViewModel.notes[0]?.id ?? null
  const isFocusLayout = isLibraryCollapsed && isInspectorCollapsed
  const activeNote = isHomeView || libraryMode === 'trash' ? null : activeNoteViewModel.note

  useEffect(() => {
    if (isCompact) {
      setInspectorCollapsed(true)
    }
  }, [isCompact])

  useEffect(() => {
    if (isNarrow) {
      setLibraryCollapsed(true)
      setInspectorCollapsed(true)
    }
  }, [isNarrow])

  useEffect(() => {
    if (!isHomeView && !selectedNoteId && firstNoteId) {
      notesViewModel.selectNote(firstNoteId)
    }
  }, [firstNoteId, isHomeView, notesViewModel, selectedNoteId])

  const handleCreateNote = useCallback(() => {
    setLibraryMode('notes')
    setIsHomeView(false)
    setInspectorCollapsed(true)
    void notesViewModel.createNote({
      parentFolderId: foldersViewModel.activeFolderId,
      title: 'Untitled',
    })
  }, [foldersViewModel.activeFolderId, notesViewModel])

  const handleSelectNote = useCallback(
    (noteId: NoteId) => {
      setLibraryMode('notes')
      setIsHomeView(false)
      notesViewModel.selectNote(noteId)
    },
    [notesViewModel],
  )

  const handleOpenHome = useCallback(() => {
    setLibraryMode('notes')
    setIsHomeView(true)
    foldersViewModel.selectFolder(null)
    notesViewModel.selectNote(null)
  }, [foldersViewModel, notesViewModel])

  const handleOpenTrash = useCallback(() => {
    setLibraryMode('trash')
    setIsHomeView(false)
    notesViewModel.selectNote(null)
  }, [notesViewModel])

  const handleSelectFolder = useCallback(
    (folderId: typeof foldersViewModel.activeFolderId) => {
      setLibraryMode('notes')
      setIsHomeView(false)
      foldersViewModel.selectFolder(folderId)
      notesViewModel.selectNote(null)
    },
    [foldersViewModel, notesViewModel],
  )

  const handleCreateFolder = useCallback(
    (parentFolderId: typeof foldersViewModel.activeFolderId) => {
      const name = window.prompt('Folder name', 'New folder')?.trim()

      if (name) {
        void foldersViewModel.createFolder({ name, parentFolderId })
      }
    },
    [foldersViewModel],
  )

  const handleRestoreNote = useCallback(
    async (noteId: NoteId) => {
      await trashViewModel.restoreNote(noteId)
      setLibraryMode('notes')
      setIsHomeView(false)
      notesViewModel.selectNote(noteId)
    },
    [notesViewModel, trashViewModel],
  )

  const handleToggleFocus = useCallback(() => {
    const shouldFocus = !(isLibraryCollapsed && isInspectorCollapsed)
    setLibraryCollapsed(shouldFocus)
    setInspectorCollapsed(shouldFocus)
  }, [isInspectorCollapsed, isLibraryCollapsed])

  return (
    <main className="sn-app-shell">
      <div className="sn-app-frame">
        <header className="sn-topbar">
          <button
            aria-label="Open home"
            className="sn-brand"
            data-active={isHomeView}
            onClick={handleOpenHome}
            type="button"
          >
            <span className="sn-brand-emblem" aria-hidden="true">
              <img
                alt=""
                className="sn-brand-emblem__image"
                draggable={false}
                src="/assets/umbra-silico-eclipse-compass-u.svg"
              />
            </span>
            <span className="sn-brand-copy">
              <span className="sn-brand-wordmark">Umbra Silico</span>
            </span>
          </button>

          <div className="sn-topbar-actions">
            <button
              aria-label="Create note"
              className="sn-icon-button sn-icon-button--primary"
              onClick={handleCreateNote}
              title="Create note"
              type="button"
            >
              <UiIcon name="plus" />
            </button>
            <button
              aria-label="Lock selected note"
              className="sn-icon-button"
              disabled={!notesViewModel.activeNoteId}
              onClick={() => {
                if (notesViewModel.activeNoteId) {
                  notesViewModel.openLockModal(notesViewModel.activeNoteId)
                }
              }}
              title="Lock selected note"
              type="button"
            >
              <UiIcon name="lock" />
            </button>
            <button
              aria-label="Refresh sync"
              className="sn-icon-button"
              onClick={() => {
                void syncViewModel.refreshPendingOperations()
              }}
              title="Refresh sync"
              type="button"
            >
              <UiIcon name="refresh" />
            </button>
            <button
              aria-label="Toggle focused layout"
              className="sn-icon-button"
              data-active={isFocusLayout}
              onClick={handleToggleFocus}
              title="Toggle focused layout"
              type="button"
            >
              <UiIcon name="focus" />
            </button>
            <button
              aria-label="Settings"
              className="sn-icon-button"
              onClick={() => setIsSettingsOpen(true)}
              title="Settings"
              type="button"
            >
              <UiIcon name="settings" />
            </button>
          </div>
        </header>

        <section
          aria-label="Notes workspace"
          className="sn-workspace"
          data-focus={isFocusLayout}
          data-left-collapsed={isLibraryCollapsed}
          data-right-collapsed={isInspectorCollapsed}
        >
          {isLibraryCollapsed ? (
            <button
              aria-label="Show library"
              className="sn-rail sn-rail--library"
              onClick={() => setLibraryCollapsed(false)}
              title="Show library"
              type="button"
            >
              <UiIcon name="panelLeft" />
              <span>{libraryMode === 'trash' ? 'Trash' : notesViewModel.notes.length}</span>
            </button>
          ) : (
            <aside className="sn-library-panel">
              {libraryMode === 'trash' ? (
                <TrashView
                  notes={trashViewModel.trashedNotes}
                  onBack={() => setLibraryMode('notes')}
                  onCollapse={() => setLibraryCollapsed(true)}
                  onPurge={(noteId) => {
                    void trashViewModel.purgeNote(noteId)
                  }}
                  onRestore={(noteId) => {
                    void handleRestoreNote(noteId)
                  }}
                />
              ) : (
                <NoteList
                  activeNoteId={notesViewModel.activeNoteId}
                  navigationSlot={
                    <FolderTree
                      activeFolderId={foldersViewModel.activeFolderId}
                      nodes={foldersViewModel.folderTree}
                      onCreateFolder={handleCreateFolder}
                      onDeleteFolder={(folderId) => {
                        if (window.confirm('Delete this folder and move its contents up?')) {
                          void foldersViewModel.deleteFolder(folderId)
                        }
                      }}
                      onMoveNoteToFolder={(noteId, folderId) => {
                        void foldersViewModel.moveNoteToFolder(noteId, folderId)
                      }}
                      onRenameFolder={(folderId, name) => {
                        void foldersViewModel.renameFolder(folderId, name)
                      }}
                      onSelectFolder={handleSelectFolder}
                    />
                  }
                  notes={notesViewModel.notes}
                  onCollapse={() => setLibraryCollapsed(true)}
                  onCreateNote={handleCreateNote}
                  onDeleteNote={(noteId) => {
                    void notesViewModel.deleteNote(noteId)
                  }}
                  onDragNoteStart={(noteId, event) => {
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData(noteDragType, noteId)
                  }}
                  onOpenLockedNote={notesViewModel.openLockModal}
                  onOpenTrash={handleOpenTrash}
                  onSearchChange={setSearchQuery}
                  onSelectNote={handleSelectNote}
                  pendingOperations={syncViewModel.pendingOperations}
                  searchQuery={searchQuery}
                  syncStatus={syncViewModel.status}
                  trashCount={trashViewModel.trashedNotes.length}
                />
              )}
            </aside>
          )}

          <section className="sn-editor-panel" aria-label="Editor">
            <EditorShell
              note={activeNote}
              onChangeDocument={activeNoteViewModel.updateDocument}
              onChangeTitle={activeNoteViewModel.updateTitle}
              onCreateNote={handleCreateNote}
              onRequestLock={notesViewModel.openLockModal}
              pendingOperations={syncViewModel.pendingOperations}
              syncStatus={syncViewModel.status}
            />
          </section>

          {isInspectorCollapsed ? (
            <button
              aria-label="Show note details"
              className="sn-rail sn-rail--inspector"
              onClick={() => setInspectorCollapsed(false)}
              title="Show note details"
              type="button"
            >
              <UiIcon name="panelRight" />
              <span>{activeNote ? 'Info' : 'Details'}</span>
            </button>
          ) : (
            <aside className="sn-inspector-panel">
              <WorkspaceInspector
                activeNote={activeNote}
                noteCount={notesViewModel.notes.length}
                notes={notesViewModel.notes}
                onCollapse={() => setInspectorCollapsed(true)}
                onSelectNote={handleSelectNote}
                pendingOperations={syncViewModel.pendingOperations}
                syncStatus={syncViewModel.status}
              />
            </aside>
          )}
        </section>
      </div>

      {lockModalViewModel.isOpen && lockModalViewModel.noteId ? (
        <LockModal
          error={lockModalViewModel.error}
          isPending={lockModalViewModel.isPending}
          mode={lockModalViewModel.mode}
          noteId={lockModalViewModel.noteId}
          onClose={lockModalViewModel.close}
          onSubmit={(masterPassword) => {
            void lockModalViewModel.submit(masterPassword)
          }}
        />
      ) : null}

      {isSettingsOpen ? (
        <SettingsModal
          onClose={() => setIsSettingsOpen(false)}
          settings={settings}
          updateSetting={updateSetting}
        />
      ) : null}
    </main>
  )
}
