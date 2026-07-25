import { describe, expect, it, vi } from 'vitest'
import {
  importTelegramChat,
  parseTelegramHtmlPage,
  readTelegramExportFolder,
} from '@/chat-import'
import { parseChatMessages } from '@/chat'
import type { ImageRepository, NoteRepository } from '@/repository/contracts'
import {
  folderIdSchema,
  imageIdSchema,
  noteIdSchema,
  type NoteDocument,
} from '@/shared/contracts'

const telegramHtml = `<!doctype html>
<html>
  <body>
    <div class="page_header"><div class="text bold">Kitchen Friend</div></div>
    <div class="history">
      <div class="message default clearfix" id="message100">
        <div class="body">
          <div class="pull_right date details" title="10.09.2025 22:04:18 GMT+03:00">22:04</div>
          <div class="from_name">Kitchen Friend</div>
          <div class="text">Hello <a href="https://example.com">link</a></div>
        </div>
      </div>
      <div class="message default clearfix joined" id="message101">
        <div class="body">
          <div class="pull_right date details" title="10.09.2025 22:05:00 GMT+03:00">22:05</div>
          <div class="text">Joined message</div>
        </div>
      </div>
      <div class="message default clearfix" id="message102">
        <div class="body">
          <div class="pull_right date details" title="10.09.2025 22:06:00 GMT+03:00">22:06</div>
          <div class="from_name">Umbra Owner</div>
          <div class="reply_to details"><a href="#go_to_message100">In reply</a></div>
          <div class="media_wrap">
            <a class="photo_wrap clearfix pull_left" href="photos/photo_1.jpg">
              <img src="photos/photo_1_thumb.jpg"/>
            </a>
          </div>
          <div class="text">My answer<br/>Second line</div>
        </div>
      </div>
    </div>
  </body>
</html>`

const joinedSecondPageHtml = `<!doctype html>
<html>
  <body>
    <div class="page_header"><div class="text bold">Kitchen Friend</div></div>
    <div class="history">
      <div class="message default clearfix joined" id="message103">
        <div class="body">
          <div class="pull_right date details" title="10.09.2025 22:07:00 GMT+03:00">22:07</div>
          <div class="text">Continued on page two</div>
        </div>
      </div>
    </div>
  </body>
</html>`

function folderFile(path: string, contents: string | Blob, type: string): File {
  const name = path.split('/').at(-1) ?? path
  const file = new File([contents], name, { type })
  Object.defineProperty(file, 'webkitRelativePath', {
    configurable: true,
    value: `TelegramExport/${path}`,
  })
  return file
}

function nestedFolderFile(
  rootRelativePath: string,
  contents: string,
): File {
  const file = new File([contents], 'messages.html', { type: 'text/html' })
  Object.defineProperty(file, 'webkitRelativePath', {
    configurable: true,
    value: `Exports/${rootRelativePath}`,
  })
  return file
}

describe('Telegram HTML parser', () => {
  it('preserves joined senders, timestamps, links, replies and media paths', () => {
    const page = parseTelegramHtmlPage(telegramHtml, 'messages.html')

    expect(page.title).toBe('Kitchen Friend')
    expect(page.messages).toHaveLength(3)
    expect(page.messages[1]?.senderName).toBe('Kitchen Friend')
    expect(page.messages[0]?.createdAt).toBe('2025-09-10T19:04:18.000Z')
    expect(page.messages[2]?.replyToExternalId).toBe('100')
    expect(page.messages[2]?.attachmentPaths).toEqual([
      { kind: 'image', path: 'photos/photo_1.jpg' },
    ])
    expect(page.messages[0]?.content).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Hello ' },
          {
            type: 'text',
            text: 'link',
            marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
          },
        ],
      },
    ])
  })

  it('rejects files that are not Telegram chat pages', () => {
    expect(() =>
      parseTelegramHtmlPage('<html><body>not a chat</body></html>', 'messages.html'),
    ).toThrow('does not contain Telegram chat messages')
  })
})

describe('Telegram export folder reader', () => {
  it('reads the user-selected folder and suggests the non-title participant as self', async () => {
    const exportFolder = await readTelegramExportFolder([
      folderFile('messages.html', telegramHtml, 'text/html'),
      folderFile('photos/photo_1.jpg', new Blob(['image']), 'image/jpeg'),
    ])

    expect(exportFolder.rootName).toBe('TelegramExport')
    expect(exportFolder.sourceFiles).toEqual(['messages.html'])
    expect(exportFolder.title).toBe('Kitchen Friend')
    expect(exportFolder.participants).toEqual([
      { messageCount: 2, name: 'Kitchen Friend' },
      { messageCount: 1, name: 'Umbra Owner' },
    ])
    expect(exportFolder.suggestedSelfParticipant).toBe('Umbra Owner')
    expect(exportFolder.availableAttachmentCount).toBe(1)
    expect(exportFolder.missingAttachmentPaths).toEqual([])
  })

  it('reports missing referenced attachments without aborting text import', async () => {
    const exportFolder = await readTelegramExportFolder([
      folderFile('messages.html', telegramHtml, 'text/html'),
    ])

    expect(exportFolder.availableAttachmentCount).toBe(0)
    expect(exportFolder.missingAttachmentPaths).toEqual(['photos/photo_1.jpg'])
    expect(exportFolder.warnings.join(' ')).toContain('missing')
  })

  it('keeps inherited sender identity across split messages HTML pages', async () => {
    const exportFolder = await readTelegramExportFolder([
      folderFile('messages.html', telegramHtml, 'text/html'),
      folderFile('messages2.html', joinedSecondPageHtml, 'text/html'),
      folderFile('photos/photo_1.jpg', new Blob(['image']), 'image/jpeg'),
    ])

    expect(exportFolder.sourceFiles).toEqual(['messages.html', 'messages2.html'])
    expect(exportFolder.messages.at(-1)).toEqual(
      expect.objectContaining({
        externalId: '103',
        senderName: 'Umbra Owner',
      }),
    )
  })

  it('rejects a parent folder containing multiple chat exports', async () => {
    await expect(
      readTelegramExportFolder([
        nestedFolderFile('ChatA/messages.html', telegramHtml),
        nestedFolderFile('ChatB/messages.html', telegramHtml),
      ]),
    ).rejects.toThrow('multiple Telegram chat exports')
  })
})

describe('Telegram import service', () => {
  it('creates a new two-sided chat in the selected Umbra folder and imports images', async () => {
    const exportFolder = await readTelegramExportFolder([
      folderFile('messages.html', telegramHtml, 'text/html'),
      folderFile('photos/photo_1.jpg', new Blob(['image']), 'image/jpeg'),
    ])
    const noteId = noteIdSchema.parse('note_telegram_import')
    const parentFolderId = folderIdSchema.parse('folder_import_destination')
    let finalDocument: NoteDocument | null = null
    const noteRepository = {
      createNote: vi.fn(async () => noteId),
      updateNote: vi.fn(async (_noteId, patch) => {
        finalDocument = patch.document ?? null
      }),
    } as unknown as NoteRepository
    const imageRepository = {
      importImage: vi.fn(async () => ({
        height: 480,
        imageId: imageIdSchema.parse('image_telegram_1'),
        width: 640,
      })),
      reconcileNoteImages: vi.fn(async () => undefined),
    } as unknown as ImageRepository
    const onProgress = vi.fn()

    const result = await importTelegramChat(
      { imageRepository, noteRepository, onProgress },
      {
        exportFolder,
        parentFolderId,
        selfParticipant: 'Umbra Owner',
      },
    )

    expect(noteRepository.createNote).toHaveBeenCalledWith(
      expect.objectContaining({
        parentFolderId,
        title: 'Kitchen Friend',
        properties: { kind: 'chat', status: 'none', tags: ['telegram'] },
      }),
    )
    expect(imageRepository.importImage).toHaveBeenCalledTimes(1)
    expect(finalDocument).not.toBeNull()

    const messages = parseChatMessages(finalDocument!)
    expect(messages.map((message) => message.side)).toEqual([
      'other',
      'other',
      'self',
    ])
    expect(messages[0]?.senderName).toBe('Kitchen Friend')
    expect(messages[2]?.senderName).toBe('Umbra Owner')
    expect(messages[2]?.content.some((node) => node.type === 'imageBlock')).toBe(true)
    expect(messages[2]?.content[0]?.type).toBe('blockquote')
    expect(result).toEqual(
      expect.objectContaining({
        importedAttachmentCount: 1,
        importedMessageCount: 3,
        noteId,
        skippedAttachmentCount: 0,
      }),
    )
    expect(onProgress).toHaveBeenLastCalledWith({
      completedAttachments: 1,
      phase: 'saving',
      totalAttachments: 1,
    })
  })

  it('keeps a readable text import when the final attachment save fails', async () => {
    const exportFolder = await readTelegramExportFolder([
      folderFile('messages.html', telegramHtml, 'text/html'),
      folderFile('photos/photo_1.jpg', new Blob(['image']), 'image/jpeg'),
    ])
    const noteId = noteIdSchema.parse('note_telegram_fallback')
    let preliminaryDocument: NoteDocument | null = null
    const noteRepository = {
      createNote: vi.fn(async (input) => {
        preliminaryDocument = input.document ?? null
        return noteId
      }),
      updateNote: vi.fn(async () => {
        throw new Error('disk full')
      }),
    } as unknown as NoteRepository
    const imageRepository = {
      importImage: vi.fn(async () => ({
        height: 480,
        imageId: imageIdSchema.parse('image_telegram_fallback'),
        width: 640,
      })),
      reconcileNoteImages: vi.fn(async () => undefined),
    } as unknown as ImageRepository

    const result = await importTelegramChat(
      { imageRepository, noteRepository },
      {
        exportFolder,
        parentFolderId: null,
        selfParticipant: 'Umbra Owner',
      },
    )

    expect(parseChatMessages(preliminaryDocument!)).toHaveLength(3)
    expect(result.importedMessageCount).toBe(3)
    expect(result.importedAttachmentCount).toBe(0)
    expect(result.skippedAttachmentCount).toBe(1)
    expect(result.warnings.join(' ')).toContain('disk full')
    expect(imageRepository.reconcileNoteImages).toHaveBeenCalledWith(noteId, [])
  })
})
