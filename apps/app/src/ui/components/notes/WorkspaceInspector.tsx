import { useMemo, useState } from 'react'
import type { NoteDetail, NoteId, NoteListItem } from '@/shared/contracts/note'
import { UiIcon } from '@/ui/icons/ui/UiIcon'

type WorkspaceInspectorProps = {
  activeNote: NoteDetail | null
  noteCount: number
  notes?: NoteListItem[]
  onCollapse?: () => void
  onSelectNote?: (noteId: NoteId) => void
  pendingOperations: number
  syncStatus: string
}

type InspectorTab = 'details' | 'links' | 'versions'

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
})

const statusLabels: Record<string, string> = {
  conflict: 'Review needed',
  dirty: 'Unsaved locally',
  error: 'Review needed',
  idle: 'Saved locally',
  saving: 'Saving',
  synced: 'Saved locally',
  syncing: 'Saving',
}

function formatDate(iso: string): string {
  const time = Date.parse(iso)
  return Number.isNaN(time) ? '-' : dateFormatter.format(time)
}

function formatTime(iso: string): string {
  const time = Date.parse(iso)
  return Number.isNaN(time) ? '-' : timeFormatter.format(time)
}

function formatStatus(status: string): string {
  return statusLabels[status] ?? 'Local note'
}

function activeTitle(note: NoteDetail | null): string {
  if (!note) return 'No note selected'
  return note.isLocked ? 'Locked note' : note.title
}

function collectDocumentText(value: unknown): string {
  if (!value || typeof value !== 'object') return ''

  const record = value as Record<string, unknown>
  const parts: string[] = []

  if (typeof record.text === 'string') {
    parts.push(record.text)
  }

  if (Array.isArray(record.content)) {
    for (const child of record.content) {
      parts.push(collectDocumentText(child))
    }
  }

  return parts.filter(Boolean).join(' ')
}

function noteText(note: NoteDetail | null): string {
  if (!note || note.isLocked) return ''
  return [note.title, note.preview, collectDocumentText(note.document.content)]
    .filter(Boolean)
    .join(' ')
}

function extractTags(text: string): string[] {
  const matches = text.match(/#[\p{L}\p{N}_-]+/gu) ?? []
  return Array.from(
    new Set(
      matches
        .map((tag) => tag.slice(1))
        .filter((tag) => !/^[0-9a-f]{6}$/i.test(tag)),
    ),
  )
}

export function WorkspaceInspector({
  activeNote,
  noteCount,
  notes = [],
  onCollapse,
  onSelectNote,
}: WorkspaceInspectorProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>('details')
  const text = useMemo(() => noteText(activeNote), [activeNote])
  const tags = useMemo(() => extractTags(text), [text])
  const linkedNotes = useMemo(() => {
    if (!activeNote || activeNote.isLocked || !text.trim()) return []

    const haystack = text.toLocaleLowerCase()
    return notes.filter((note) => {
      if (note.id === activeNote.id || note.isLocked) return false
      return note.title.length > 2 && haystack.includes(note.title.toLocaleLowerCase())
    })
  }, [activeNote, notes, text])

  return (
    <section className="sn-inspector" aria-label="Note details">
      <header className="sn-panel-heading">
        <div>
          <div className="sn-panel-heading__title-row">
            <h2>Details</h2>
            <span className="sn-panel-heading__right">
              {activeNote ? formatStatus(activeNote.syncStatus) : `${noteCount} total`}
            </span>
          </div>
          <p>{activeTitle(activeNote)}</p>
        </div>
        <div className="sn-panel-heading__actions">
          {onCollapse ? (
            <button
              aria-label="Collapse details panel"
              className="sn-icon-button"
              onClick={onCollapse}
              title="Collapse details panel"
              type="button"
            >
              <UiIcon name="chevronRight" />
            </button>
          ) : null}
        </div>
      </header>

      <div className="sn-inspector-tabs" role="tablist" aria-label="Inspector views">
        <button
          aria-selected={activeTab === 'details'}
          className="sn-inspector-tab"
          onClick={() => setActiveTab('details')}
          role="tab"
          type="button"
        >
          <UiIcon name="info" />
          Details
        </button>
        <button
          aria-selected={activeTab === 'links'}
          className="sn-inspector-tab"
          onClick={() => setActiveTab('links')}
          role="tab"
          type="button"
        >
          <UiIcon name="link" />
          Links
        </button>
        <button
          aria-selected={activeTab === 'versions'}
          className="sn-inspector-tab"
          onClick={() => setActiveTab('versions')}
          role="tab"
          type="button"
        >
          <UiIcon name="history" />
          Versions
        </button>
      </div>

      {!activeNote ? (
        <div className="sn-inspector-empty">
          <UiIcon name="document" />
          <strong>Select a note</strong>
          <p>
            {noteCount === 0
              ? 'Create a note to see its details here.'
              : 'Choose a note from the library to inspect it.'}
          </p>
        </div>
      ) : null}

      {activeNote && activeTab === 'details' ? (
        <div className="sn-inspector-section" role="tabpanel">
          <dl className="sn-inspector-list">
            <div>
              <dt>Folder</dt>
              <dd>
                <UiIcon name="folder" />
                Local notebook
              </dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{formatDate(activeNote.updatedAt)} at {formatTime(activeNote.updatedAt)}</dd>
            </div>
            <div>
              <dt>State</dt>
              <dd>
                <span className="sn-status-dot" data-tone={activeNote.syncStatus} />
                {formatStatus(activeNote.syncStatus)}
              </dd>
            </div>
            <div>
              <dt>Privacy</dt>
              <dd>
                <UiIcon name={activeNote.isLocked ? 'lock' : 'shield'} />
                {activeNote.isLocked ? 'Locked note' : 'Private local note'}
              </dd>
            </div>
          </dl>

          <section className="sn-tags-section" aria-label="Tags">
            <h3>Tags</h3>
            {tags.length > 0 ? (
              <div className="sn-tag-list">
                {tags.map((tag) => (
                  <span className="sn-tag" key={tag}>
                    <UiIcon name="tag" />
                    {tag}
                  </span>
                ))}
              </div>
            ) : (
              <p>No tags in this note.</p>
            )}
          </section>
        </div>
      ) : null}

      {activeNote && activeTab === 'links' ? (
        <div className="sn-inspector-section" role="tabpanel">
          {linkedNotes.length > 0 ? (
            <ul className="sn-linked-notes">
              {linkedNotes.map((note) => (
                <li key={note.id}>
                  <button
                    onClick={() => onSelectNote?.(note.id)}
                    type="button"
                  >
                    <UiIcon name="document" />
                    <span>{note.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="sn-inspector-empty sn-inspector-empty--compact">
              <UiIcon name="link" />
              <strong>No linked notes</strong>
              <p>Links appear when this note references another note title.</p>
            </div>
          )}
        </div>
      ) : null}

      {activeNote && activeTab === 'versions' ? (
        <div className="sn-inspector-section" role="tabpanel">
          <dl className="sn-inspector-list">
            <div>
              <dt>Local revision</dt>
              <dd>r{activeNote.localRevision}</dd>
            </div>
            <div>
              <dt>Remote revision</dt>
              <dd>{activeNote.remoteRevision === null ? 'Not published' : `r${activeNote.remoteRevision}`}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDate(activeNote.createdAt)}</dd>
            </div>
            <div>
              <dt>Modified</dt>
              <dd>{formatDate(activeNote.updatedAt)}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      <div className="sn-inspector-palette" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
    </section>
  )
}
