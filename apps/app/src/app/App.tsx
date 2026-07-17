import { useCallback, useEffect, useRef, useState } from 'react'
import { AppProviders } from '@/app/providers'
import { EditorShell } from '@/ui/components/notes/EditorShell'
import { FolderTree } from '@/ui/components/notes/FolderTree'
import { noteDragType } from '@/ui/components/notes/note-drag'
import { LockModal } from '@/ui/components/notes/LockModal'
import { MoveToFolderDialog } from '@/ui/components/notes/MoveToFolderDialog'
import { NoteList } from '@/ui/components/notes/NoteList'
import { QuickSwitcher } from '@/ui/components/notes/QuickSwitcher'
import { TemplatePicker } from '@/ui/components/notes/TemplatePicker'
import { TrashView } from '@/ui/components/notes/TrashView'
import { WorkspaceInspector } from '@/ui/components/notes/WorkspaceInspector'
import { SettingsModal } from '@/ui/components/silicon/SettingsModal'
import { ConfirmationDialog, PromptDialog } from '@/ui/components/silicon'
import { MobileTabBar, type MobileTab } from '@/ui/components/silicon/MobileTabBar'
import { UiIcon } from '@/ui/icons/ui/UiIcon'
import type { CreateNoteInput, FolderId, FolderTreeNode, NoteId } from '@/shared/contracts'
import {
  createNoteFromTemplate,
  noteTemplates,
  type NoteTemplateId,
} from '@/shared/note-templates'
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
type FolderPromptState =
  | { mode: 'create'; parentFolderId: FolderId | null }
  | { folderId: FolderId; initialValue: string; mode: 'rename' }

type FolderDeleteState = {
  folderId: FolderId
  name: string
}

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
  const isCompact = useMediaQuery('(max-width: 1279px)')
  const isNarrow = useMediaQuery('(max-width: 959px)')
  const [searchQuery, setSearchQuery] = useState('')
  const [libraryMode, setLibraryMode] = useState<LibraryMode>('notes')
  const [isLibraryCollapsed, setLibraryCollapsed] = useState(false)
  const [isInspectorCollapsed, setInspectorCollapsed] = useState(false)
  const [isCompactInspectorOpen, setCompactInspectorOpen] = useState(false)
  const [isHomeView, setIsHomeView] = useState(false)
  const [isCreatingNote, setIsCreatingNote] = useState(false)
  const [pendingCreatedNoteId, setPendingCreatedNoteId] = useState<NoteId | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isQuickSwitcherOpen, setIsQuickSwitcherOpen] = useState(false)
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false)
  const [folderPrompt, setFolderPrompt] = useState<FolderPromptState | null>(null)
  const [folderPendingDelete, setFolderPendingDelete] = useState<FolderDeleteState | null>(null)
  const [notePendingMove, setNotePendingMove] = useState<NoteId | null>(null)
  const [mobileTab, setMobileTab] = useState<MobileTab>('notes')
  const creatingNoteRef = useRef(false)

  const foldersViewModel = useFoldersViewModel()
  const notesViewModel = useNotesViewModel({
    folderId: libraryMode === 'notes' ? foldersViewModel.activeFolderId : undefined,
    search: searchQuery,
  })
  const allNotesViewModel = useNotesViewModel()
  const trashViewModel = useTrashViewModel()
  const activeNoteViewModel = useActiveNoteViewModel()
  const syncViewModel = useSyncViewModel()
  const lockModalViewModel = useLockModalViewModel()
  const { settings, updateSetting } = useSettings()

  // In the local-only build the outbox is never drained, so a growing
  // pending-operations count would only mislead; show it when a remote exists.
  const visiblePendingOperations = syncViewModel.hasRemote
    ? syncViewModel.pendingOperations
    : 0

  const selectedNoteId = notesViewModel.activeNoteId
  const firstNoteId = notesViewModel.notes[0]?.id ?? null
  const isCompactDesktop = isCompact && !isNarrow
  const isInspectorEffectivelyCollapsed = isCompactDesktop
    ? !isCompactInspectorOpen
    : isInspectorCollapsed
  const isFocusLayout = isLibraryCollapsed && isInspectorEffectivelyCollapsed
  const activeNote = isHomeView || libraryMode === 'trash' ? null : activeNoteViewModel.note
  const noteToMove = notePendingMove
    ? allNotesViewModel.notes.find((note) => note.id === notePendingMove) ?? null
    : null

  useEffect(() => {
    if (!isCompactDesktop) {
      setCompactInspectorOpen(false)
    }
  }, [isCompactDesktop])

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault()
        setIsTemplatePickerOpen(false)
        setIsSettingsOpen(false)
        setIsQuickSwitcherOpen((isOpen) => !isOpen)
        return
      }

      if (event.key === 'Escape') {
        setIsQuickSwitcherOpen(false)
        setIsTemplatePickerOpen(false)
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  useEffect(() => {
    if (!isHomeView && !selectedNoteId && firstNoteId) {
      notesViewModel.selectNote(firstNoteId)
    }
  }, [firstNoteId, isHomeView, notesViewModel, selectedNoteId])

  useEffect(() => {
    if (pendingCreatedNoteId && activeNoteViewModel.note?.id === pendingCreatedNoteId) {
      setIsHomeView(false)
      setPendingCreatedNoteId(null)
    }
  }, [activeNoteViewModel.note?.id, pendingCreatedNoteId])

  const handleCreateNote = useCallback((input: CreateNoteInput = {}) => {
    if (creatingNoteRef.current) return

    creatingNoteRef.current = true
    setIsCreatingNote(true)
    setLibraryMode('notes')
    setCompactInspectorOpen(false)
    setMobileTab('editor')
    setIsQuickSwitcherOpen(false)
    setIsTemplatePickerOpen(false)

    void notesViewModel.createNote({
        ...input,
        parentFolderId: foldersViewModel.activeFolderId,
        title: input.title ?? 'Untitled',
      })
      .then((noteId) => {
        setPendingCreatedNoteId(noteId)
      })
      .catch(() => undefined)
      .finally(() => {
        creatingNoteRef.current = false
        setIsCreatingNote(false)
      })
  }, [foldersViewModel.activeFolderId, notesViewModel])

  const handleSelectNote = useCallback(
    (noteId: NoteId) => {
      setLibraryMode('notes')
      setIsHomeView(false)
      setMobileTab('editor')
      notesViewModel.selectNote(noteId)
    },
    [notesViewModel],
  )

  const handleOpenHome = useCallback(() => {
    setLibraryMode('notes')
    setIsHomeView(true)
    setMobileTab('editor')
    foldersViewModel.selectFolder(null)
    notesViewModel.selectNote(null)
  }, [foldersViewModel, notesViewModel])

  const handleOpenTrash = useCallback(() => {
    setLibraryMode('trash')
    setIsHomeView(false)
    setMobileTab('notes')
    notesViewModel.selectNote(null)
  }, [notesViewModel])

  const handleSelectFolder = useCallback(
    (folderId: typeof foldersViewModel.activeFolderId) => {
      setLibraryMode('notes')
      setIsHomeView(false)
      setMobileTab('notes')
      foldersViewModel.selectFolder(folderId)
      notesViewModel.selectNote(null)
    },
    [foldersViewModel, notesViewModel],
  )

  const handleCreateFolder = useCallback(
    (parentFolderId: typeof foldersViewModel.activeFolderId) => {
      setFolderPrompt({ mode: 'create', parentFolderId })
    },
    [],
  )

  const handleOpenTemplates = useCallback(() => {
    setIsQuickSwitcherOpen(false)
    setIsTemplatePickerOpen(true)
  }, [])

  const handleSelectTemplate = useCallback((templateId: NoteTemplateId) => {
    handleCreateNote(createNoteFromTemplate(templateId))
  }, [handleCreateNote])

  function findFolderName(nodes: FolderTreeNode[], folderId: string | null): string {
    if (!folderId) return 'All notes'
    for (const node of nodes) {
      if (node.folder.id === folderId) return node.folder.name
      const nested = findFolderName(node.children, folderId)
      if (nested !== 'All notes') return nested
    }
    return 'All notes'
  }

  const activeFolderName = activeNote
    ? findFolderName(foldersViewModel.folderTree, activeNote.parentFolderId)
    : 'All notes'
  const selectedFolderName = findFolderName(
    foldersViewModel.folderTree,
    foldersViewModel.activeFolderId,
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
    const shouldFocus = !(isLibraryCollapsed && isInspectorEffectivelyCollapsed)
    setLibraryCollapsed(shouldFocus)
    if (isCompactDesktop) {
      setCompactInspectorOpen(false)
    } else {
      setInspectorCollapsed(shouldFocus)
    }
  }, [isCompactDesktop, isInspectorEffectivelyCollapsed, isLibraryCollapsed])

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
              aria-label="Open command menu"
              className="sn-icon-button"
              onClick={() => setIsQuickSwitcherOpen(true)}
              title="Command menu (Ctrl/⌘ K)"
              type="button"
            >
              <UiIcon name="search" />
            </button>
            <button
              aria-label="Create note"
              className="sn-icon-button sn-icon-button--primary"
              disabled={isCreatingNote}
              onClick={() => handleCreateNote()}
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
            {syncViewModel.hasRemote ? (
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
            ) : null}
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
          data-compact={isCompactDesktop}
          data-focus={isFocusLayout}
          data-left-collapsed={isLibraryCollapsed}
          data-right-collapsed={isInspectorEffectivelyCollapsed}
          data-mobile-tab={isNarrow ? mobileTab : undefined}
        >
          {!isNarrow && isLibraryCollapsed ? (
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
                  onCollapse={isNarrow ? undefined : () => setLibraryCollapsed(true)}
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
                  hasRemote={syncViewModel.hasRemote}
                  navigationSlot={
                    <FolderTree
                      activeFolderId={foldersViewModel.activeFolderId}
                      nodes={foldersViewModel.folderTree}
                      onCreateFolder={handleCreateFolder}
                      onDeleteFolder={(folderId) => {
                        setFolderPendingDelete({
                          folderId,
                          name: findFolderName(foldersViewModel.folderTree, folderId),
                        })
                      }}
                      onMoveNoteToFolder={(noteId, folderId) => {
                        void foldersViewModel.moveNoteToFolder(noteId, folderId)
                      }}
                      onRenameFolder={(folderId, currentName) => {
                        setFolderPrompt({
                          folderId,
                          initialValue: currentName,
                          mode: 'rename',
                        })
                      }}
                      onSelectFolder={handleSelectFolder}
                    />
                  }
                  notes={notesViewModel.notes}
                  onCollapse={isNarrow ? undefined : () => setLibraryCollapsed(true)}
                  onCreateNote={handleCreateNote}
                  onDeleteNote={(noteId) => {
                    void notesViewModel.deleteNote(noteId)
                  }}
                  onDragNoteStart={(noteId, event) => {
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData(noteDragType, noteId)
                  }}
                  onOpenLockedNote={(noteId) => {
                    setIsHomeView(false)
                    setMobileTab('editor')
                    notesViewModel.openLockModal(noteId)
                  }}
                  onOpenTrash={handleOpenTrash}
                  onMoveNote={setNotePendingMove}
                  onSearchChange={setSearchQuery}
                  onSelectNote={handleSelectNote}
                  pendingOperations={visiblePendingOperations}
                  searchQuery={searchQuery}
                  scopeLabel={selectedFolderName}
                  syncStatus={syncViewModel.status}
                  trashCount={trashViewModel.trashedNotes.length}
                />
              )}
            </aside>
          )}

          <section className="sn-editor-panel" aria-label="Editor">
            <EditorShell
              hasRemote={syncViewModel.hasRemote}
              note={activeNote}
              onChangeDocument={activeNoteViewModel.updateDocument}
              onBrowseTemplates={handleOpenTemplates}
              onChangeTitle={activeNoteViewModel.updateTitle}
              onCreateNote={handleCreateNote}
              isCreatingNote={isCreatingNote}
              onRequestLock={notesViewModel.openLockModal}
              pendingOperations={visiblePendingOperations}
              syncStatus={syncViewModel.status}
            />
          </section>

          {!isNarrow && isInspectorEffectivelyCollapsed ? (
            <button
              aria-label="Show note details"
              className="sn-rail sn-rail--inspector"
              onClick={() => {
                if (isCompactDesktop) {
                  setCompactInspectorOpen(true)
                } else {
                  setInspectorCollapsed(false)
                }
              }}
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
                folderName={activeFolderName}
                noteCount={notesViewModel.notes.length}
                onChangeProperties={activeNoteViewModel.updateProperties}
                onCollapse={isNarrow ? undefined : () => {
                  if (isCompactDesktop) {
                    setCompactInspectorOpen(false)
                  } else {
                    setInspectorCollapsed(true)
                  }
                }}
                onOpenSettings={isNarrow ? () => setIsSettingsOpen(true) : undefined}
              />
            </aside>
          )}
        </section>
        {isNarrow ? (
          <MobileTabBar
            activeTab={mobileTab}
            hasRemote={syncViewModel.hasRemote}
            notes={allNotesViewModel.notes}
            onTabChange={setMobileTab}
            pendingOperations={visiblePendingOperations}
            syncStatus={syncViewModel.status}
          />
        ) : null}
      </div>

      {isQuickSwitcherOpen ? (
        <QuickSwitcher
          notes={allNotesViewModel.notes}
          onClose={() => setIsQuickSwitcherOpen(false)}
          onCreateBlank={() => handleCreateNote()}
          onOpenSettings={() => {
            setIsQuickSwitcherOpen(false)
            setIsSettingsOpen(true)
          }}
          onOpenTemplates={handleOpenTemplates}
          onOpenTrash={() => {
            setIsQuickSwitcherOpen(false)
            handleOpenTrash()
          }}
          onSelectNote={(noteId) => {
            setIsQuickSwitcherOpen(false)
            const note = allNotesViewModel.notes.find((candidate) => candidate.id === noteId)
            if (note?.isLocked) {
              setIsHomeView(false)
              setMobileTab('editor')
              notesViewModel.openLockModal(noteId)
            } else {
              handleSelectNote(noteId)
            }
          }}
        />
      ) : null}

      {isTemplatePickerOpen ? (
        <TemplatePicker
          onClose={() => setIsTemplatePickerOpen(false)}
          onSelect={handleSelectTemplate}
          templates={noteTemplates}
        />
      ) : null}

      {folderPrompt ? (
        <PromptDialog
          description={folderPrompt.mode === 'create'
            ? 'Create a local folder for a smaller, easier-to-scan library.'
            : 'Choose a clear name. Notes inside the folder will stay in place.'}
          initialValue={folderPrompt.mode === 'create' ? 'New folder' : folderPrompt.initialValue}
          key={folderPrompt.mode === 'create'
            ? `create-${folderPrompt.parentFolderId ?? 'root'}`
            : `rename-${folderPrompt.folderId}`}
          label="Folder name"
          onCancel={() => setFolderPrompt(null)}
          onSubmit={(name) => {
            if (folderPrompt.mode === 'create') {
              void foldersViewModel.createFolder({
                name,
                parentFolderId: folderPrompt.parentFolderId,
              })
            } else {
              void foldersViewModel.renameFolder(folderPrompt.folderId, name)
            }
            setFolderPrompt(null)
          }}
          submitLabel={folderPrompt.mode === 'create' ? 'Create folder' : 'Save name'}
          title={folderPrompt.mode === 'create' ? 'Create folder' : 'Rename folder'}
        />
      ) : null}

      {folderPendingDelete ? (
        <ConfirmationDialog
          confirmLabel="Delete folder"
          description={`“${folderPendingDelete.name}” will be deleted. Its notes and subfolders will move up one level; no notes will be erased.`}
          onCancel={() => setFolderPendingDelete(null)}
          onConfirm={() => {
            void foldersViewModel.deleteFolder(folderPendingDelete.folderId)
            setFolderPendingDelete(null)
          }}
          title="Delete this folder?"
        />
      ) : null}

      {noteToMove ? (
        <MoveToFolderDialog
          currentFolderId={noteToMove.parentFolderId}
          folders={foldersViewModel.folderTree}
          noteTitle={noteToMove.title}
          onCancel={() => setNotePendingMove(null)}
          onMove={(folderId) => {
            void foldersViewModel.moveNoteToFolder(noteToMove.id, folderId)
            setNotePendingMove(null)
          }}
        />
      ) : null}

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
