import { useCallback, useEffect, useRef, useState } from 'react'
import type { ImportedImage } from '@/repository/contracts'
import type { NoteId } from '@/shared/contracts'
import type { ChatMessageAuthorInput } from '@/viewmodel/chat-view-model'

export type ChatImageSender = {
  error: string | null
  isSending: boolean
  dismissError(): void
  send(files: File[], author: ChatMessageAuthorInput): void
}

export type ChatImageSenderDependencies = {
  importImage(noteId: NoteId, file: File): Promise<ImportedImage>
  noteId: NoteId | null
  sendImageMessage(image: ImportedImage, author: ChatMessageAuthorInput): Promise<void>
}

/**
 * Turns a multi-file drop into one chat message per image.
 *
 * Imports run in sequence so a failure can name the file that failed instead of
 * collapsing the batch, and a batch id makes a drop that is still running when
 * the user switches notes land silently rather than reporting into the wrong
 * conversation.
 */
export function useChatImageSender({
  importImage,
  noteId,
  sendImageMessage,
}: ChatImageSenderDependencies): ChatImageSender {
  const [error, setError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const batchRef = useRef(0)

  useEffect(() => {
    batchRef.current += 1
    setError(null)
    setIsSending(false)
  }, [noteId])

  const send = useCallback(
    (files: File[], author: ChatMessageAuthorInput) => {
      if (!noteId) return

      void (async () => {
        const batchId = batchRef.current + 1
        batchRef.current = batchId
        setError(null)
        setIsSending(true)
        const failures: string[] = []

        for (const file of files) {
          try {
            const imported = await importImage(noteId, file)
            await sendImageMessage(imported, author)
          } catch (sendError) {
            const reason =
              sendError instanceof Error ? sendError.message : 'Unknown storage error.'
            failures.push(`${file.name || 'Image'}: ${reason}`)
          }
        }

        if (batchRef.current !== batchId) {
          return
        }

        if (failures.length > 0) {
          setError(
            failures.length === 1
              ? `Could not save ${failures[0]}`
              : `${failures.length} images could not be saved. ${failures.join(' ')}`,
          )
        }

        setIsSending(false)
      })()
    },
    [importImage, noteId, sendImageMessage],
  )

  return {
    dismissError: useCallback(() => setError(null), []),
    error,
    isSending,
    send,
  }
}
