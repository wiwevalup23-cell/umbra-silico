/// <reference types="node" />

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createDraftLocalNote,
  deviceIdSchema,
  noteIdSchema,
  userIdSchema,
  type NoteListItem,
} from '@/shared/contracts'
import {
  NoteCard,
  NoteList,
  TemplatePicker,
  WorkspaceInspector,
} from '@/ui/components/notes'
import { noteTemplates } from '@/shared/note-templates'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const cleanupTasks: Array<() => void> = []
const noteId = noteIdSchema.parse('note_p2_ux')
const now = '2026-07-16T19:00:00.000Z'

function renderUi(children: ReactNode) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => root.render(children))

  return {
    container,
    cleanup() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

function readApplicationSources(directory: string): string {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.name !== 'test')
    .map((entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return readApplicationSources(path)
      return /\.(ts|tsx)$/.test(entry.name) ? readFileSync(path, 'utf8') : ''
    })
    .join('\n')
}

afterEach(() => {
  while (cleanupTasks.length) cleanupTasks.pop()?.()
})

describe('P2 visual system, accessibility and brand', () => {
  it('shows page status and an explicit overflow count on note cards', () => {
    const note: NoteListItem = {
      id: noteId,
      isLocked: false,
      parentFolderId: null,
      preview: 'A concise project update',
      propertyStatus: 'active',
      syncStatus: 'synced',
      tags: ['research', 'writing', 'weekly', 'review'],
      title: 'Project update',
      updatedAt: now,
    }
    const rendered = renderUi(<NoteCard note={note} />)
    cleanupTasks.push(rendered.cleanup)

    expect(rendered.container.querySelector('.sn-note-card__page-status')?.textContent)
      .toContain('In progress')
    expect(rendered.container.querySelectorAll('.sn-note-card__tags > span')).toHaveLength(3)
    expect(rendered.container.querySelector('.sn-note-card__tag-overflow')?.textContent)
      .toBe('+2')
  })

  it('keeps one primary header action and adds a clear textual empty-library CTA', () => {
    const onCreateNote = vi.fn()
    const rendered = renderUi(
      <NoteList
        activeNoteId={null}
        notes={[]}
        onCreateNote={onCreateNote}
        onOpenLockedNote={vi.fn()}
        onSelectNote={vi.fn()}
      />,
    )
    cleanupTasks.push(rendered.cleanup)

    const emptyAction = rendered.container.querySelector<HTMLButtonElement>(
      '.sn-empty-list__action',
    )
    expect(emptyAction?.textContent).toContain('New blank note')
    expect(rendered.container.querySelector('.sn-panel-heading__actions .sn-icon-button--primary'))
      .toBeNull()
    act(() => emptyAction?.click())
    expect(onCreateNote).toHaveBeenCalledOnce()
  })

  it('gives every template a distinct structural icon', () => {
    const rendered = renderUi(
      <TemplatePicker onClose={vi.fn()} onSelect={vi.fn()} templates={noteTemplates} />,
    )
    cleanupTasks.push(rendered.cleanup)

    const cards = Array.from(document.body.querySelectorAll<HTMLElement>('.sn-template-card'))
    const pathSignatures = cards.map((card) => Array.from(card.querySelectorAll('path'))
      .map((path) => path.getAttribute('d'))
      .join('|'))

    expect(cards.map((card) => card.dataset.template)).toEqual([
      'blank',
      'chat',
      'daily',
      'meeting',
      'project',
    ])
    expect(new Set(pathSignatures).size).toBe(noteTemplates.length)
  })

  it('keeps Inspector Info human-readable and hides diagnostic or duplicate state', () => {
    const note = createDraftLocalNote({
      deviceId: deviceIdSchema.parse('p2_device'),
      id: noteId,
      now,
      title: 'Readable details',
      userId: userIdSchema.parse('p2_user'),
    })
    const rendered = renderUi(
      <WorkspaceInspector activeNote={note} folderName="Research" noteCount={1} />,
    )
    cleanupTasks.push(rendered.cleanup)

    const infoTab = Array.from(rendered.container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Info'))
    act(() => infoTab?.click())

    expect(rendered.container.textContent).toContain('Research')
    expect(rendered.container.textContent).toContain('Local only · not encrypted')
    expect(rendered.container.textContent).not.toContain('Local revision')
    expect(rendered.container.textContent).not.toContain('Saved locally')
  })

  it('ships one offline Umbra Silico identity across web, PWA and Tauri', () => {
    const html = readFileSync('index.html', 'utf8')
    const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
      background_color: string
      name: string
      orientation: string
      short_name: string
      theme_color: string
    }
    const tauri = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')) as {
      app: { windows: Array<{ theme: string; title: string }> }
      productName: string
    }
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { name: string }
    const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8')
    const vite = readFileSync('vite.config.ts', 'utf8')
    const fontPath = 'public/fonts/CormorantGaramond-Variable.woff2'

    expect(html).toContain('<title>Umbra Silico</title>')
    expect(html).toContain('content="#f1ede2"')
    expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/)
    expect(manifest).toMatchObject({
      background_color: '#e1dcd2',
      name: 'Umbra Silico',
      orientation: 'any',
      short_name: 'Umbra Silico',
      theme_color: '#f1ede2',
    })
    expect(tauri.productName).toBe('Umbra Silico')
    expect(tauri.app.windows[0]).toMatchObject({ theme: 'Light', title: 'Umbra Silico' })
    expect(packageJson.name).toBe('umbra-silico')
    expect(cargo).toContain('name = "umbra-silico"')
    expect(existsSync(fontPath)).toBe(true)
    expect(statSync(fontPath).size).toBeGreaterThan(100_000)
    expect(vite).toContain('woff2')
  })

  it('defines the P2 visual contract without native scale or browser dialogs', () => {
    const css = readFileSync('src/ui/styles/silicon-nostalgia.css', 'utf8')
    const mobileCss = readFileSync('src/ui/styles/mobile-ui.css', 'utf8')
    const source = readApplicationSources('src')

    expect(css).toContain('--sn-selection:')
    expect(css).toContain('--sn-pending:')
    expect(css).toContain('.sn-note-card__properties')
    expect(css).toContain('.sn-inspector-list > div:first-child')
    expect(css).not.toContain('.sn-settings-range')
    expect(mobileCss).toContain('color: var(--sn-muted)')
    expect(mobileCss).toContain('font-size: 12px')
    expect(source).not.toMatch(/window\.(prompt|confirm|alert)\s*\(/)
  })
})
