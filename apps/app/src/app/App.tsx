import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import brandEmblemUrl from '../../src-tauri/icons/128x128@2x.png'
import { AppProviders } from '@/app/providers'
import type { EditorShellApi } from '@/ui/components/notes/EditorShell'
import { FolderTree } from '@/ui/components/notes/FolderTree'
import { noteDragType } from '@/ui/components/notes/note-drag'
import { NoteList } from '@/ui/components/notes/NoteList'
import { TrashView } from '@/ui/components/notes/TrashView'
import { WorkspaceInspector } from '@/ui/components/notes/WorkspaceInspector'
import { MobileTabBar } from '@/ui/components/silicon/MobileTabBar'
import { UiIcon } from '@/ui/icons/ui/UiIcon'
import type { CreateNoteInput, FolderTreeNode, NoteId } from '@/shared/contracts'
import { createNoteFromTemplate, type NoteTemplateId } from '@/shared/note-templates'
import { WorkspaceDialogs } from '@/app/WorkspaceDialogs'
import { TranslationProvider } from '@/ui/i18n/TranslationProvider'
import { useTranslation } from '@/ui/i18n/use-translation'
import { useSettings } from '@/viewmodel/useSettings'
import {
  useActiveNoteViewModel,
  useChatImageSender,
  useChatViewModel,
  useFoldersViewModel,
  useNoteImagesViewModel,
  useNotesViewModel,
  useOverlayActions,
  useSyncViewModel,
  useTrashViewModel,
  useWorkspaceLayout,
  searchDebounceMs,
  useDebouncedValue,
} from '@/viewmodel'

// The editor drags TipTap, ProseMirror and KaTeX behind it, so it loads on
// demand and the library renders on first paint instead of waiting for it.
const EditorShell = lazy(async () => ({
  default: (await import('@/ui/components/notes/EditorShell')).EditorShell,
}))
const ChatShell = lazy(async () => ({
  default: (await import('@/ui/components/chat')).ChatShell,
}))

type LibraryMode = 'notes' | 'trash'

export function App() {
  return (
    <AppProviders>
      <LocalizedWorkspace />
    </AppProviders>
  )
}

/**
 * The locale lives in settings, which is view-model state, while the
 * translator has to be reachable from presentational components. This is the
 * one place both are in scope.
 */
function LocalizedWorkspace() {
  const { settings } = useSettings()

  return (
    <TranslationProvider locale={settings.locale}>
      <AppWorkspace />
    </TranslationProvider>
  )
}

function AppWorkspace() {
  const { t } = useTranslation()
  const layout = useWorkspaceLayout()
  const { close: closeOverlay, open: openOverlay, toggle: toggleOverlay } = useOverlayActions()
  const [searchQuery, setSearchQuery] = useState('')
  const [libraryMode, setLibraryMode] = useState<LibraryMode>('notes')
  const [isHomeView, setIsHomeView] = useState(false)
  const [isCreatingNote, setIsCreatingNote] = useState(false)
  const [pendingCreatedNoteId, setPendingCreatedNoteId] = useState<NoteId | null>(null)
  const creatingNoteRef = useRef(false)
  const editorApiRef = useRef<EditorShellApi | null>(null)
  const { isNarrow, mobileTab, setMobileTab } = layout

  const foldersViewModel = useFoldersViewModel()
  // The input stays on searchQuery so typing is instant; the query trails it so
  // a full-text scan runs once per pause rather than once per character.
  const debouncedSearchQuery = useDebouncedValue(searchQuery, searchDebounceMs)
  const notesViewModel = useNotesViewModel({
    folderId: libraryMode === 'notes' ? foldersViewModel.activeFolderId : undefined,
    search: debouncedSearchQuery,
  })
  const allNotesViewModel = useNotesViewModel()
  const trashViewModel = useTrashViewModel()
  const activeNoteViewModel = useActiveNoteViewModel()
  const noteImagesViewModel = useNoteImagesViewModel(
    activeNoteViewModel.note && !activeNoteViewModel.note.isLocked
      ? activeNoteViewModel.note.id
      : null,
  )
  const syncViewModel = useSyncViewModel()

  // In the local-only build the outbox is never drained, so a growing
  // pending-operations count would only mislead; show it when a remote exists.
  const visiblePendingOperations = syncViewModel.hasRemote
    ? syncViewModel.pendingOperations
    : 0

  const selectedNoteId = notesViewModel.activeNoteId
  const firstNoteId = notesViewModel.notes[0]?.id ?? null
  const activeNote = isHomeView || libraryMode === 'trash' ? null : activeNoteViewModel.note
  const chatViewModel = useChatViewModel(activeNote, activeNoteViewModel.updateDocument)

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault()
        toggleOverlay({ kind: 'quickSwitcher' })
        return
      }

      if (event.key === 'Escape') {
        closeOverlay()
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [closeOverlay, toggleOverlay])

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
    layout.collapseInspector()
    setMobileTab('editor')
    closeOverlay()

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
  }, [closeOverlay, foldersViewModel.activeFolderId, layout, notesViewModel, setMobileTab])

  const handleSelectNote = useCallback(
    (noteId: NoteId) => {
      setLibraryMode('notes')
      setIsHomeView(false)
      setMobileTab('editor')
      notesViewModel.selectNote(noteId)
    },
    [notesViewModel, setMobileTab],
  )

  const handleOpenHome = useCallback(() => {
    setLibraryMode('notes')
    setIsHomeView(true)
    setMobileTab('editor')
    foldersViewModel.selectFolder(null)
    notesViewModel.selectNote(null)
  }, [foldersViewModel, notesViewModel, setMobileTab])

  const handleOpenTrash = useCallback(() => {
    setLibraryMode('trash')
    setIsHomeView(false)
    setMobileTab('notes')
    notesViewModel.selectNote(null)
  }, [notesViewModel, setMobileTab])

  const handleSelectFolder = useCallback(
    (folderId: typeof foldersViewModel.activeFolderId) => {
      setLibraryMode('notes')
      setIsHomeView(false)
      setMobileTab('notes')
      foldersViewModel.selectFolder(folderId)
      notesViewModel.selectNote(null)
    },
    [foldersViewModel, notesViewModel, setMobileTab],
  )

  const handleCreateFolder = useCallback(
    (parentFolderId: typeof foldersViewModel.activeFolderId) => {
      openOverlay({ kind: 'createFolder', parentFolderId })
    },
    [openOverlay],
  )

  const handleOpenLockedNote = useCallback(
    (noteId: NoteId) => {
      setIsHomeView(false)
      setMobileTab('editor')
      notesViewModel.openLockModal(noteId)
    },
    [notesViewModel, setMobileTab],
  )

  const handleCreateFromTemplate = useCallback(
    (templateId?: NoteTemplateId) => {
      handleCreateNote(templateId ? createNoteFromTemplate(templateId) : {})
    },
    [handleCreateNote],
  )

  const chatImageSender = useChatImageSender({
    importImage: noteImagesViewModel.importImage,
    noteId: activeNoteViewModel.note?.id ?? null,
    sendImageMessage: chatViewModel.sendImageMessage,
  })

  const handleRevealImage = useCallback((imageId: string) => {
    // On mobile the gallery lives in the Details tab; jump to the editor
    // first so the scroll target is actually on screen.
    setMobileTab('editor')
    requestAnimationFrame(() => {
      editorApiRef.current?.revealImage(imageId)
    })
  }, [setMobileTab])

  // Returns null when the folder is gone, rather than the label for "no
  // folder": a folder actually named "All notes" used to end the search early.
  function findFolderName(
    nodes: FolderTreeNode[],
    folderId: string | null,
  ): string | null {
    if (!folderId) return null

    for (const node of nodes) {
      if (node.folder.id === folderId) return node.folder.name

      const nested = findFolderName(node.children, folderId)

      if (nested !== null) return nested
    }

    return null
  }

  function folderLabel(folderId: string | null): string {
    return findFolderName(foldersViewModel.folderTree, folderId) ?? t('library.allNotes')
  }

  const activeFolderName = activeNote ? folderLabel(activeNote.parentFolderId) : t('library.allNotes')
  const selectedFolderName = folderLabel(foldersViewModel.activeFolderId)

  const handleRestoreNote = useCallback(
    async (noteId: NoteId) => {
      await trashViewModel.restoreNote(noteId)
      setLibraryMode('notes')
      setIsHomeView(false)
      notesViewModel.selectNote(noteId)
    },
    [notesViewModel, trashViewModel],
  )

  return (
    <main className="sn-app-shell">
      <div className="sn-app-frame">
        <header className="sn-topbar">
          <button
            aria-label={t('shell.openHome')}
            className="sn-brand"
            data-active={isHomeView}
            onClick={handleOpenHome}
            type="button"
          >
            <span className="sn-brand-emblem" aria-hidden="true">
              <img
                alt=""
                className="sn-brand-emblem__image"
                decoding="sync"
                draggable={false}
                src={brandEmblemUrl}
              />
            </span>
            <span className="sn-brand-copy">
              <span className="sn-brand-wordmark">Umbra Silico</span>
            </span>
          </button>

          <div className="sn-topbar-actions">
            <button
              aria-label={t('shell.commandMenu')}
              className="sn-icon-button"
              onClick={() => openOverlay({ kind: 'quickSwitcher' })}
              title={t('shell.commandMenuHint')}
              type="button"
            >
              <UiIcon name="search" />
            </button>
            <button
              aria-label={t('shell.createNote')}
              className="sn-icon-button sn-icon-button--primary"
              disabled={isCreatingNote}
              onClick={() => handleCreateNote()}
              title={t('shell.createNote')}
              type="button"
            >
              <UiIcon name="plus" />
            </button>
            <button
              aria-label={t('shell.lockSelectedNote')}
              className="sn-icon-button"
              disabled={!notesViewModel.activeNoteId}
              onClick={() => {
                if (notesViewModel.activeNoteId) {
                  notesViewModel.openLockModal(notesViewModel.activeNoteId)
                }
              }}
              title={t('shell.lockSelectedNote')}
              type="button"
            >
              <UiIcon name="lock" />
            </button>
            {syncViewModel.hasRemote ? (
              <button
                aria-label={t('shell.refreshSync')}
                className="sn-icon-button"
                onClick={() => {
                  void syncViewModel.refreshPendingOperations()
                }}
                title={t('shell.refreshSync')}
                type="button"
              >
                <UiIcon name="refresh" />
              </button>
            ) : null}
            <button
              aria-label={t('shell.toggleFocus')}
              className="sn-icon-button"
              data-active={layout.isFocusLayout}
              onClick={layout.toggleFocus}
              title={t('shell.toggleFocus')}
              type="button"
            >
              <UiIcon name="focus" />
            </button>
            <button
              aria-label={t('shell.settings')}
              className="sn-icon-button"
              onClick={() => openOverlay({ kind: 'settings' })}
              title={t('shell.settings')}
              type="button"
            >
              <UiIcon name="settings" />
            </button>
          </div>
        </header>

        <section
          aria-label={t('shell.workspace')}
          className="sn-workspace"
          data-compact={layout.isCompactDesktop}
          data-focus={layout.isFocusLayout}
          data-left-collapsed={layout.isLibraryCollapsed}
          data-right-collapsed={layout.isInspectorCollapsed}
          data-mobile-tab={isNarrow ? mobileTab : undefined}
        >
          {!isNarrow && layout.isLibraryCollapsed ? (
            <button
              aria-label={t('shell.showLibrary')}
              className="sn-rail sn-rail--library"
              onClick={layout.expandLibrary}
              title={t('shell.showLibrary')}
              type="button"
            >
              <UiIcon name="panelLeft" />
              <span>{libraryMode === 'trash' ? t('trash.title') : notesViewModel.notes.length}</span>
            </button>
          ) : (
            <aside className="sn-library-panel">
              {libraryMode === 'trash' ? (
                <TrashView
                  notes={trashViewModel.trashedNotes}
                  onBack={() => setLibraryMode('notes')}
                  onCollapse={isNarrow ? undefined : layout.collapseLibrary}
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
                        openOverlay({
                          kind: 'deleteFolder',
                          folderId,
                          name: folderLabel(folderId),
                        })
                      }}
                      onMoveNoteToFolder={(noteId, folderId) => {
                        void foldersViewModel.moveNoteToFolder(noteId, folderId)
                      }}
                      onRenameFolder={(folderId, currentName) => {
                        openOverlay({ kind: 'renameFolder', folderId, currentName })
                      }}
                      onSelectFolder={handleSelectFolder}
                    />
                  }
                  notes={notesViewModel.notes}
                  onCollapse={isNarrow ? undefined : layout.collapseLibrary}
                  onCreateNote={handleCreateNote}
                  onDeleteNote={(noteId) => {
                    void notesViewModel.deleteNote(noteId)
                  }}
                  onDragNoteStart={(noteId, event) => {
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData(noteDragType, noteId)
                    const preview = document.createElement('div')
                    preview.className = 'sn-note-drag-preview'
                    preview.textContent = event.currentTarget.querySelector('strong')?.textContent
                      ?? t('note.untitled')
                    document.body.append(preview)
                    event.dataTransfer.setDragImage(preview, 18, 18)
                    window.setTimeout(() => preview.remove(), 0)
                  }}
                  onOpenLockedNote={handleOpenLockedNote}
                  onOpenTrash={handleOpenTrash}
                  onMoveNote={(noteId) => openOverlay({ kind: 'moveNote', noteId })}
                  onSearchChange={setSearchQuery}
                  onSelectNote={handleSelectNote}
                  pendingOperations={visiblePendingOperations}
                  searchQuery={searchQuery}
                  scopeLabel={
                    foldersViewModel.activeFolderId ? selectedFolderName : null
                  }
                  syncStatus={syncViewModel.status}
                  trashCount={trashViewModel.trashedNotes.length}
                />
              )}
            </aside>
          )}

          <section className="sn-editor-panel" aria-label={t('shell.editor')}>
            <Suspense fallback={<div className="sn-editor-loading" aria-hidden="true" />}>
            {activeNote && !activeNote.isLocked && chatViewModel.isChatNote ? (
              <ChatShell
                hasRemote={syncViewModel.hasRemote}
                imageResolver={noteImagesViewModel.resolver}
                imageSendError={chatImageSender.error}
                isSendingImages={chatImageSender.isSending}
                messages={chatViewModel.messages}
                note={activeNote}
                onChangeTitle={activeNoteViewModel.updateTitle}
                onDeleteMessage={(messageId) => {
                  void chatViewModel.deleteMessage(messageId)
                }}
                onEditMessage={(messageId, content) => {
                  void chatViewModel.editMessage(messageId, content)
                }}
                onDismissImageError={chatImageSender.dismissError}
                onImportTelegram={() => openOverlay({ kind: 'telegramImport' })}
                onRequestLock={notesViewModel.openLockModal}
                onSendImages={chatImageSender.send}
                onSendMessage={(content, author) => {
                  void chatViewModel.sendMessage(content, author)
                }}
                onSetMessagePinned={(messageId, pinned) => {
                  void chatViewModel.setMessagePinned(messageId, pinned)
                }}
              />
            ) : (
              <EditorShell
                editorApiRef={editorApiRef}
                hasRemote={syncViewModel.hasRemote}
                imageResolver={noteImagesViewModel.resolver}
                note={activeNote}
                onChangeDocument={activeNoteViewModel.updateDocument}
                onBrowseTemplates={() => openOverlay({ kind: 'templates' })}
                onChangeTitle={activeNoteViewModel.updateTitle}
                onCreateNote={handleCreateNote}
                isCreatingNote={isCreatingNote}
                onImportImage={noteImagesViewModel.importImage}
                onRequestLock={notesViewModel.openLockModal}
                pendingOperations={visiblePendingOperations}
                syncStatus={syncViewModel.status}
              />
            )}
            </Suspense>
          </section>

          {!isNarrow && layout.isInspectorCollapsed ? (
            <button
              aria-label={t('shell.showDetails')}
              className="sn-rail sn-rail--inspector"
              onClick={layout.expandInspector}
              title={t('shell.showDetails')}
              type="button"
            >
              <UiIcon name="panelRight" />
              <span>{t(activeNote ? 'shell.info' : 'shell.details')}</span>
            </button>
          ) : (
            <aside className="sn-inspector-panel">
              <WorkspaceInspector
                activeNote={activeNote}
                folderName={activeFolderName}
                imageResolver={noteImagesViewModel.resolver}
                noteCount={notesViewModel.notes.length}
                noteImages={noteImagesViewModel.images}
                onChangeProperties={activeNoteViewModel.updateProperties}
                onRevealImage={handleRevealImage}
                onCollapse={isNarrow ? undefined : layout.collapseInspector}
                onOpenHistory={activeNote ? () => openOverlay({ kind: 'history' }) : undefined}
                onOpenSettings={
                  isNarrow ? () => openOverlay({ kind: 'settings' }) : undefined
                }
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

      <WorkspaceDialogs
        activeNote={activeNote}
        allNotes={allNotesViewModel.notes}
        destinationFolderLabel={selectedFolderName}
        foldersViewModel={foldersViewModel}
        onCreateNote={handleCreateFromTemplate}
        onOpenLockedNote={handleOpenLockedNote}
        onOpenNote={handleSelectNote}
        onOpenTrash={handleOpenTrash}
      />
    </main>
  )
}
