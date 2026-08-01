import { lazy, Suspense } from 'react'
import type { NoteDetail, NoteId, NoteListItem } from '@/shared/contracts'
import { noteTemplates, type NoteTemplateId } from '@/shared/note-templates'
import { ConfirmationDialog, PromptDialog } from '@/ui/components/silicon'
import { LockModal } from '@/ui/components/notes/LockModal'
import type { FoldersViewModel } from '@/viewmodel'
import { customBackgroundValue } from '@/shared/backgrounds'
import {
  useBackupViewModel,
  useCustomBackground,
  useLockModalViewModel,
  useNoteHistoryViewModel,
  useOverlayActions,
  useWorkspaceOverlay,
} from '@/viewmodel'
import { useSettings } from '@/viewmodel/useSettings'
import {
  useImageRepository,
  useNoteRepository,
} from '@/viewmodel/repository-hooks'
import { useSyncEngine } from '@/viewmodel/sync-engine-hooks'
import { useTranslation } from '@/ui/i18n/use-translation'

const TelegramImportDialog = lazy(async () => ({
  default: (await import('@/ui/components/chat')).TelegramImportDialog,
}))
const MoveToFolderDialog = lazy(async () => ({
  default: (await import('@/ui/components/notes/MoveToFolderDialog')).MoveToFolderDialog,
}))
const NoteHistoryDialog = lazy(async () => ({
  default: (await import('@/ui/components/notes/NoteHistoryDialog')).NoteHistoryDialog,
}))
const QuickSwitcher = lazy(async () => ({
  default: (await import('@/ui/components/notes/QuickSwitcher')).QuickSwitcher,
}))
const TemplatePicker = lazy(async () => ({
  default: (await import('@/ui/components/notes/TemplatePicker')).TemplatePicker,
}))
const SettingsModal = lazy(async () => ({
  default: (await import('@/ui/components/silicon/SettingsModal')).SettingsModal,
}))
const BackupPanel = lazy(async () => ({
  default: (await import('@/ui/components/silicon/BackupPanel')).BackupPanel,
}))

export type WorkspaceDialogsProps = {
  activeNote: NoteDetail | null
  allNotes: NoteListItem[]
  destinationFolderLabel: string
  /**
   * Passed down rather than re-read here: calling useFoldersViewModel again
   * would register a second folder-tree live query, so every folder change
   * would be read from the store twice.
   */
  foldersViewModel: FoldersViewModel
  onCreateNote: (template?: NoteTemplateId) => void
  onOpenLockedNote: (noteId: NoteId) => void
  onOpenNote: (noteId: NoteId) => void
  onOpenTrash: () => void
}

/**
 * Every modal surface, rendered from the overlay store.
 *
 * This is the only component that subscribes to which overlay is open, so
 * opening one re-renders the dialogs rather than the whole workspace behind
 * them. The lock modal is the exception: it follows the note being locked, not
 * a UI intent, so it keeps its own view model.
 */
export function WorkspaceDialogs({
  activeNote,
  allNotes,
  destinationFolderLabel,
  foldersViewModel,
  onCreateNote,
  onOpenLockedNote,
  onOpenNote,
  onOpenTrash,
}: WorkspaceDialogsProps) {
  const { t } = useTranslation()
  const overlay = useWorkspaceOverlay()
  const { close, open } = useOverlayActions()
  const lockModalViewModel = useLockModalViewModel()
  const backupViewModel = useBackupViewModel()
  const customBackground = useCustomBackground()
  const { settings, updateSetting } = useSettings()
  const noteRepository = useNoteRepository()
  const imageRepository = useImageRepository()
  const syncEngine = useSyncEngine()
  // History is read only while its dialog is open; passing null keeps the op
  // log out of the hot path the rest of the time.
  const noteHistoryViewModel = useNoteHistoryViewModel(
    overlay.kind === 'history' ? activeNote?.id ?? null : null,
  )

  return (
    <Suspense fallback={null}>
      {overlay.kind === 'quickSwitcher' ? (
        <QuickSwitcher
          notes={allNotes}
          onClose={close}
          onCreateBlank={() => onCreateNote()}
          onOpenSettings={() => open({ kind: 'settings' })}
          onOpenTemplates={() => open({ kind: 'templates' })}
          onOpenTrash={() => {
            close()
            onOpenTrash()
          }}
          onSelectNote={(noteId) => {
            close()
            const note = allNotes.find((candidate) => candidate.id === noteId)

            if (note?.isLocked) {
              onOpenLockedNote(noteId)
            } else {
              onOpenNote(noteId)
            }
          }}
        />
      ) : null}

      {overlay.kind === 'templates' ? (
        <TemplatePicker
          onClose={close}
          onImportTelegram={() => open({ kind: 'telegramImport' })}
          onSelect={(templateId) => onCreateNote(templateId)}
          templates={noteTemplates}
        />
      ) : null}

      {overlay.kind === 'telegramImport' ? (
        <TelegramImportDialog
          destinationLabel={destinationFolderLabel}
          onClose={close}
          onImport={async (exportFolder, selfParticipant, onProgress) => {
            const { importTelegramChat } = await import('@/chat-import')

            return importTelegramChat(
              {
                imageRepository,
                noteRepository,
                onProgress,
                requestSync: () => syncEngine?.requestSync('outbox-change'),
              },
              {
                exportFolder,
                parentFolderId: foldersViewModel.activeFolderId,
                selfParticipant,
              },
            )
          }}
          onOpenNote={(noteId) => {
            close()
            onOpenNote(noteId)
          }}
          onReadFolder={async (...args) =>
            (await import('@/chat-import')).readTelegramExportFolder(...args)
          }
        />
      ) : null}

      {overlay.kind === 'createFolder' || overlay.kind === 'renameFolder' ? (
        <PromptDialog
          description={
            overlay.kind === 'createFolder'
              ? t('folder.createHint')
              : t('folder.renameHint')
          }
          initialValue={
            overlay.kind === 'createFolder'
              ? t('folder.newFolderName')
              : overlay.currentName
          }
          key={
            overlay.kind === 'createFolder'
              ? `create-${overlay.parentFolderId ?? 'root'}`
              : `rename-${overlay.folderId}`
          }
          label={t('folder.nameLabel')}
          onCancel={close}
          onSubmit={(name) => {
            if (overlay.kind === 'createFolder') {
              void foldersViewModel.createFolder({
                name,
                parentFolderId: overlay.parentFolderId,
              })
            } else {
              void foldersViewModel.renameFolder(overlay.folderId, name)
            }

            close()
          }}
          submitLabel={t(
            overlay.kind === 'createFolder' ? 'folder.createSubmit' : 'folder.renameSubmit',
          )}
          title={t(
            overlay.kind === 'createFolder' ? 'folder.createTitle' : 'folder.renameTitle',
          )}
        />
      ) : null}

      {overlay.kind === 'deleteFolder' ? (
        <ConfirmationDialog
          confirmLabel={t('folder.deleteConfirm')}
          description={t('folder.deleteDescription', { name: overlay.name })}
          onCancel={close}
          onConfirm={() => {
            void foldersViewModel.deleteFolder(overlay.folderId)
            close()
          }}
          title={t('folder.deleteTitle')}
        />
      ) : null}

      {overlay.kind === 'moveNote'
        ? (() => {
            const noteToMove = allNotes.find((note) => note.id === overlay.noteId)

            return noteToMove ? (
              <MoveToFolderDialog
                currentFolderId={noteToMove.parentFolderId}
                folders={foldersViewModel.folderTree}
                noteTitle={noteToMove.title}
                onCancel={close}
                onMove={(folderId) => {
                  void foldersViewModel.moveNoteToFolder(noteToMove.id, folderId)
                  close()
                }}
              />
            ) : null
          })()
        : null}

      {lockModalViewModel.isOpen && lockModalViewModel.noteId ? (
        <LockModal
          error={lockModalViewModel.error}
          isPending={lockModalViewModel.isPending}
          mode={lockModalViewModel.mode}
          noteId={lockModalViewModel.noteId}
          onAcknowledgeRecoveryKey={lockModalViewModel.acknowledgeRecoveryKey}
          onClose={lockModalViewModel.close}
          onSubmit={(credentials) => {
            void lockModalViewModel.submit(credentials)
          }}
          recoveryKey={lockModalViewModel.recoveryKey}
        />
      ) : null}

      {overlay.kind === 'history' && activeNote ? (
        <NoteHistoryDialog
          error={noteHistoryViewModel.error}
          isLoading={noteHistoryViewModel.isLoading}
          isRestoring={noteHistoryViewModel.isRestoring}
          noteTitle={activeNote.isLocked ? t('note.locked') : activeNote.title}
          onClose={close}
          onRestore={(opId) => {
            void noteHistoryViewModel.restore(opId)
          }}
          versions={noteHistoryViewModel.versions}
        />
      ) : null}

      {overlay.kind === 'settings' ? (
        <SettingsModal
          customBackground={{
            error: customBackground.error,
            isBusy: customBackground.isBusy,
            // Selecting the uploaded image is the point of uploading it, so
            // a successful upload applies it and removing it falls back to
            // the plain grid.
            onDismissError: customBackground.dismissError,
            onRemove: () => {
              void customBackground.remove().then(() => {
                if (settings.backgroundImage === customBackgroundValue) {
                  updateSetting('backgroundImage', null)
                }
              })
            },
            onUpload: (file) => {
              void customBackground.upload(file).then((stored) => {
                if (stored) {
                  updateSetting('backgroundImage', customBackgroundValue)
                }
              })
            },
            url: customBackground.url,
          }}
          dataSlot={
            <BackupPanel
              busyTask={backupViewModel.busyTask}
              error={backupViewModel.error}
              onExportBackup={(options) => {
                void backupViewModel.exportBackup(options)
              }}
              onExportMarkdown={() => {
                void backupViewModel.exportMarkdown()
              }}
              onRestoreFile={(file) => {
                void backupViewModel.restoreFromFile(file)
              }}
              status={backupViewModel.status}
            />
          }
          onClose={close}
          settings={settings}
          updateSetting={updateSetting}
        />
      ) : null}
    </Suspense>
  )
}
