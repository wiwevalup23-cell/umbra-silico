import { useCallback, useEffect, useState } from 'react'
import { AppProviders } from '@/app/providers'
import { EditorShell } from '@/ui/components/notes/EditorShell'
import { FolderTree } from '@/ui/components/notes/FolderTree'
import { noteDragType } from '@/ui/components/notes/note-drag'
import { LockModal } from '@/ui/components/notes/LockModal'
import { NoteList } from '@/ui/components/notes/NoteList'
import { QuickSwitcher } from '@/ui/components/notes/QuickSwitcher'
import { TemplatePicker } from '@/ui/components/notes/TemplatePicker'
import { TrashView } from '@/ui/components/notes/TrashView'
import { WorkspaceInspector } from '@/ui/components/notes/WorkspaceInspector'
import { SettingsModal } from '@/ui/components/silicon/SettingsModal'
import { MobileTabBar, type MobileTab } from '@/ui/components/silicon/MobileTabBar'
import { UiIcon } from '@/ui/icons/ui/UiIcon'
import type { CreateNoteInput, FolderTreeNode, NoteId } from '@/shared/contracts'
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
  const [isQuickSwitcherOpen, setIsQuickSwitcherOpen] = useState(false)
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false)
  const [mobileTab, setMobileTab] = useState<MobileTab>('notes')

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

  const handleCreateNote = useCallback((input: CreateNoteInput = {}) => {
    setLibraryMode('notes')
    setIsHomeView(false)
    setInspectorCollapsed(true)
    setMobileTab('editor')
    setIsQuickSwitcherOpen(false)
    setIsTemplatePickerOpen(false)
    void notesViewModel.createNote({
      ...input,
      parentFolderId: foldersViewModel.activeFolderId,
      title: input.title ?? 'Untitled',
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
    setMobileTab('notes')
    setIsHomeView(false)
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
      const name = window.prompt('Folder name', 'New folder')?.trim()

      if (name) {
        void foldersViewModel.createFolder({ name, parentFolderId })
      }
    },
    [foldersViewModel],
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
              aria-label="Open quick switcher"
              className="sn-icon-button"
              onClick={() => setIsQuickSwitcherOpen(true)}
              title="Quick switcher (Ctrl/⌘ K)"
              type="button"
            >
              <UiIcon name="search" />
            </button>
            <button
              aria-label="Create note"
              className="sn-icon-button sn-icon-button--primary"
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
                  onCollapse={() => isNarrow ? setMobileTab('editor') : setLibraryCollapsed(true)}
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
                  onCollapse={() => isNarrow ? setMobileTab('editor') : setLibraryCollapsed(true)}
                  onCreateNote={handleCreateNote}
                  onDeleteNote={(noteId) => {
                    void notesViewModel.deleteNote(noteId)
                  }}
                  onDragNoteStart={(noteId, event) => {
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData(noteDragType, noteId)
                  }}
                  onOpenLockedNote={(noteId) => {
                    setMobileTab('editor')
                    notesViewModel.openLockModal(noteId)
                  }}
                  onOpenTrash={handleOpenTrash}
                  onSearchChange={setSearchQuery}
                  onSelectNote={handleSelectNote}
                  pendingOperations={visiblePendingOperations}
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
              onBrowseTemplates={handleOpenTemplates}
              onChangeTitle={activeNoteViewModel.updateTitle}
              onCreateNote={handleCreateNote}
              onRequestLock={notesViewModel.openLockModal}
              pendingOperations={visiblePendingOperations}
              syncStatus={syncViewModel.status}
            />
          </section>

          {!isNarrow && isInspectorCollapsed ? (
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
                folderName={activeFolderName}
                noteCount={notesViewModel.notes.length}
                onChangeProperties={activeNoteViewModel.updateProperties}
                onCollapse={() => isNarrow ? setMobileTab('editor') : setInspectorCollapsed(true)}
                pendingOperations={visiblePendingOperations}
                syncStatus={syncViewModel.status}
              />
            </aside>
          )}
        </section>
        {isNarrow ? (
          <MobileTabBar
            activeTab={mobileTab}
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
