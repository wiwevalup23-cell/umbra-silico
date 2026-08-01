import { useCallback, useState } from 'react'
import type { RestoreBackupReport } from '@/backup'
import { useImageRepository, useNoteRepository } from '@/viewmodel/repository-hooks'

export type BackupTask = 'backup' | 'markdown' | 'restore' | null

export type BackupViewModel = {
  busyTask: BackupTask
  error: string | null
  lastRestore: RestoreBackupReport | null
  status: string | null
  dismiss(): void
  exportBackup(options?: { includeImages?: boolean }): Promise<void>
  exportMarkdown(): Promise<void>
  restoreFromFile(file: File): Promise<void>
}

/**
 * Loaded on demand: backup only runs when the user asks for it, and pulling
 * the bundle format, its schemas and the Markdown renderer into the initial
 * chunk would make every cold start pay for a feature most sessions never use.
 */
function loadBackupModule() {
  return import('@/backup')
}

function downloadFile(name: string, contents: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  // Revoking immediately is safe: the click has already handed the blob to the
  // download manager.
  URL.revokeObjectURL(url)
}

export function useBackupViewModel(): BackupViewModel {
  const noteRepository = useNoteRepository()
  const imageRepository = useImageRepository()
  const [busyTask, setBusyTask] = useState<BackupTask>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastRestore, setLastRestore] = useState<RestoreBackupReport | null>(null)

  const run = useCallback(
    async (task: Exclude<BackupTask, null>, work: () => Promise<string>) => {
      setBusyTask(task)
      setError(null)
      setStatus(null)

      try {
        setStatus(await work())
      } catch (taskError) {
        setError(taskError instanceof Error ? taskError.message : 'Something went wrong.')
      } finally {
        setBusyTask(null)
      }
    },
    [],
  )

  const exportBackup = useCallback(
    (options: { includeImages?: boolean } = {}) =>
      run('backup', async () => {
        const { backupFileName, createBackup } = await loadBackupModule()
        const bundle = await createBackup(
          { imageRepository, noteRepository },
          { appVersion: __APP_VERSION__, includeImages: options.includeImages },
        )
        downloadFile(
          backupFileName(bundle.createdAt),
          JSON.stringify(bundle),
          'application/json',
        )

        return `Saved ${bundle.notes.length} note(s), ${bundle.folders.length} folder(s) and ${bundle.images.length} image(s).`
      }),
    [imageRepository, noteRepository, run],
  )

  const exportMarkdown = useCallback(
    () =>
      run('markdown', async () => {
        const { libraryToMarkdown, markdownFileName } = await loadBackupModule()
        const { folders, notes } = await noteRepository.readBackupData()
        const createdAt = new Date().toISOString()
        downloadFile(
          markdownFileName(createdAt),
          libraryToMarkdown(notes, folders, createdAt),
          'text/markdown',
        )

        const readable = notes.filter((note) => !note.isLocked && note.deletedAt === null)
        return `Exported ${readable.length} readable note(s).`
      }),
    [noteRepository, run],
  )

  const restoreFromFile = useCallback(
    (file: File) =>
      run('restore', async () => {
        const { restoreBackup } = await loadBackupModule()
        const report = await restoreBackup(
          { imageRepository, noteRepository },
          JSON.parse(await file.text()),
        )
        setLastRestore(report)

        return report.notesAdded === 0 && report.foldersAdded === 0
          ? 'Everything in this backup is already here; nothing was changed.'
          : `Added ${report.notesAdded} note(s), ${report.foldersAdded} folder(s) and ${report.imagesRestored} image(s).`
      }),
    [imageRepository, noteRepository, run],
  )

  return {
    busyTask,
    dismiss: useCallback(() => {
      setError(null)
      setStatus(null)
    }, []),
    error,
    exportBackup,
    exportMarkdown,
    lastRestore,
    restoreFromFile,
    status,
  }
}
