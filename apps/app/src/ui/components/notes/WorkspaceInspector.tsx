import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  emptyNoteProperties,
  normalizeNoteTags,
  notePropertiesSchema,
  type ImageSourceResolver,
  type NoteDetail,
  type NoteImageListItem,
  type NoteProperties,
} from '@/shared/contracts'
import { UiIcon } from '@/ui/icons/ui/UiIcon'
import { NoteImageGallery } from './NoteImageGallery'
import { StatusPicker } from './StatusPicker'

type WorkspaceInspectorProps = {
  activeNote: NoteDetail | null
  folderName?: string
  imageResolver?: ImageSourceResolver | null
  noteCount: number
  noteImages?: NoteImageListItem[]
  onChangeProperties?: (noteId: NoteDetail['id'], properties: NoteProperties) => Promise<void>
  onCollapse?: () => void
  onOpenSettings?: () => void
  onRevealImage?: (imageId: string) => void
}

type InspectorTab = 'properties' | 'photos' | 'info'

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
})

function formatDate(iso: string): string {
  const time = Date.parse(iso)
  return Number.isNaN(time) ? '-' : dateFormatter.format(time)
}

function formatTime(iso: string): string {
  const time = Date.parse(iso)
  return Number.isNaN(time) ? '-' : timeFormatter.format(time)
}

function activeTitle(note: NoteDetail | null): string {
  if (!note) return 'No note selected'
  return note.isLocked ? 'Locked note' : note.title
}

export function WorkspaceInspector({
  activeNote,
  folderName = 'All notes',
  imageResolver = null,
  noteCount,
  noteImages = [],
  onChangeProperties,
  onCollapse,
  onOpenSettings,
  onRevealImage,
}: WorkspaceInspectorProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>('properties')
  const [tagDraft, setTagDraft] = useState('')
  const [propertyError, setPropertyError] = useState<string | null>(null)
  const activeNoteId = activeNote?.id ?? null
  const activeNoteIsLocked = activeNote?.isLocked ?? false
  const activeNoteProperties = activeNote && !activeNote.isLocked
    ? activeNote.properties
    : undefined
  const incomingProperties = useMemo(
    () => activeNoteId && !activeNoteIsLocked
      ? notePropertiesSchema.parse(activeNoteProperties ?? emptyNoteProperties)
      : emptyNoteProperties,
    [activeNoteId, activeNoteIsLocked, activeNoteProperties],
  )
  const [properties, setProperties] = useState<NoteProperties>(incomingProperties)
  const pendingSaveCountRef = useRef(0)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const activeNoteIdRef = useRef(activeNoteId)
  activeNoteIdRef.current = activeNoteId

  useEffect(() => {
    setTagDraft('')
    setPropertyError(null)
  }, [activeNoteId])

  useEffect(() => {
    if (pendingSaveCountRef.current === 0) {
      setProperties(incomingProperties)
    }
  }, [activeNoteId, incomingProperties])

  function saveProperties(nextProperties: NoteProperties) {
    if (!activeNote || activeNote.isLocked || !onChangeProperties) return

    const noteId = activeNote.id
    const parsedProperties = notePropertiesSchema.parse(nextProperties)
    setProperties(parsedProperties)
    setPropertyError(null)
    pendingSaveCountRef.current += 1
    saveQueueRef.current = saveQueueRef.current.then(async () => {
      try {
        await onChangeProperties(noteId, parsedProperties)
      } catch (error) {
        if (activeNoteIdRef.current === noteId) {
          setPropertyError(
            error instanceof Error
              ? error.message
              : typeof error === 'string' && error.trim()
                ? error
                : 'Properties could not be saved.',
          )
        }
      } finally {
        pendingSaveCountRef.current = Math.max(0, pendingSaveCountRef.current - 1)
      }
    })
  }

  function addTag(event: FormEvent) {
    event.preventDefault()
    const tags = normalizeNoteTags([...properties.tags, tagDraft])

    if (tags.length === properties.tags.length) {
      setTagDraft('')
      return
    }

    setTagDraft('')
    void saveProperties({ ...properties, tags })
  }

  return (
    <section className="sn-inspector" aria-label="Note details">
      <header className="sn-panel-heading">
        <div>
          <div className="sn-panel-heading__title-row">
            <h2>Details</h2>
            <span className="sn-panel-heading__right">
              {noteCount === 1 ? '1 note' : `${noteCount} notes`}
            </span>
          </div>
          <p>{activeTitle(activeNote)}</p>
        </div>
        {onCollapse || onOpenSettings ? (
          <div className="sn-panel-heading__actions">
            {onOpenSettings ? (
              <button
                aria-label="Open settings"
                className="sn-icon-button"
                onClick={onOpenSettings}
                title="Settings"
                type="button"
              >
                <UiIcon name="settings" />
              </button>
            ) : null}
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
        ) : null}
      </header>

      <div className="sn-inspector-tabs" role="tablist" aria-label="Inspector views">
        <button
          aria-selected={activeTab === 'properties'}
          className="sn-inspector-tab"
          onClick={() => setActiveTab('properties')}
          role="tab"
          type="button"
        >
          <UiIcon name="tag" />
          Properties
        </button>
        <button
          aria-selected={activeTab === 'photos'}
          className="sn-inspector-tab"
          onClick={() => setActiveTab('photos')}
          role="tab"
          type="button"
        >
          <UiIcon name="image" />
          Photos
          {!activeNoteIsLocked && noteImages.length > 0 ? (
            <span className="sn-inspector-tab__badge">{noteImages.length}</span>
          ) : null}
        </button>
        <button
          aria-selected={activeTab === 'info'}
          className="sn-inspector-tab"
          onClick={() => setActiveTab('info')}
          role="tab"
          type="button"
        >
          <UiIcon name="info" />
          Info
        </button>
      </div>

      {!activeNote ? (
        <div className="sn-inspector-empty">
          <UiIcon name="document" />
          <strong>Select a note</strong>
          <p>{noteCount === 0 ? 'Create a note to add its properties.' : 'Choose a note from the library.'}</p>
        </div>
      ) : null}

      {activeNote && activeTab === 'properties' ? (
        <div className="sn-inspector-section sn-properties" role="tabpanel">
          {activeNote.isLocked ? (
            <div className="sn-inspector-empty sn-inspector-empty--compact">
              <UiIcon name="lock" />
              <strong>Properties are encrypted</strong>
              <p>Unlock this note to view and edit its tags and status.</p>
            </div>
          ) : (
            <>
              <div className="sn-property-field">
                <span><UiIcon name="info" /> Status</span>
                <StatusPicker
                  onChange={(status) => void saveProperties({
                    ...properties,
                    status,
                  })}
                  value={properties.status}
                />
              </div>

              <section className="sn-tags-section" aria-label="Page tags">
                <div className="sn-property-heading">
                  <h3><UiIcon name="tag" /> Tags</h3>
                  <span>{properties.tags.length}/12</span>
                </div>
                {properties.tags.length > 0 ? (
                  <div className="sn-tag-list">
                    {properties.tags.map((tag) => (
                      <span className="sn-tag" key={tag}>
                        {tag}
                        <button
                          aria-label={`Remove tag ${tag}`}
                          onClick={() => void saveProperties({
                            ...properties,
                            tags: properties.tags.filter((candidate) => candidate !== tag),
                          })}
                          type="button"
                        >
                          <UiIcon name="close" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="sn-property-empty">No tags yet. Add only what helps you find this page later.</p>
                )}
                <form className="sn-tag-entry" onSubmit={addTag}>
                  <input
                    aria-label="New page tag"
                    maxLength={32}
                    onChange={(event) => setTagDraft(event.target.value)}
                    placeholder="Add a tag"
                    value={tagDraft}
                  />
                  <button disabled={!tagDraft.trim() || properties.tags.length >= 12} type="submit">Add</button>
                </form>
              </section>
              {propertyError ? <p className="sn-property-error" role="alert">{propertyError}</p> : null}
            </>
          )}
        </div>
      ) : null}

      {activeNote && activeTab === 'photos' ? (
        <div className="sn-inspector-section" role="tabpanel">
          {activeNote.isLocked ? (
            <div className="sn-inspector-empty sn-inspector-empty--compact">
              <UiIcon name="lock" />
              <strong>Photos are encrypted</strong>
              <p>Unlock this note to browse its images.</p>
            </div>
          ) : (
            <NoteImageGallery
              images={noteImages}
              onSelectImage={(imageId) => onRevealImage?.(imageId)}
              resolver={imageResolver}
            />
          )}
        </div>
      ) : null}

      {activeNote && activeTab === 'info' ? (
        <div className="sn-inspector-section" role="tabpanel">
          <dl className="sn-inspector-list">
            <div><dt>Folder</dt><dd><UiIcon name="folder" />{folderName}</dd></div>
            <div><dt>Updated</dt><dd>{formatDate(activeNote.updatedAt)} at {formatTime(activeNote.updatedAt)}</dd></div>
            <div><dt>Privacy</dt><dd><UiIcon name={activeNote.isLocked ? 'lock' : 'shield'} />{activeNote.isLocked ? 'Encrypted and locked' : 'Local only · not encrypted'}</dd></div>
            <div><dt>Created</dt><dd>{formatDate(activeNote.createdAt)}</dd></div>
          </dl>
        </div>
      ) : null}

      <div className="sn-inspector-palette" aria-hidden="true"><span /><span /><span /><span /><span /><span /></div>
    </section>
  )
}
