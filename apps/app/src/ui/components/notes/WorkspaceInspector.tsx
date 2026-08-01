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
import { useTranslation } from '@/ui/i18n/use-translation'
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
  onOpenHistory?: () => void
  onOpenSettings?: () => void
  onRevealImage?: (imageId: string) => void
}

type InspectorTab = 'properties' | 'photos' | 'info'

const dateOptions: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
}

const timeOptions: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
}

export function WorkspaceInspector({
  activeNote,
  folderName,
  imageResolver = null,
  noteCount,
  noteImages = [],
  onChangeProperties,
  onCollapse,
  onOpenHistory,
  onOpenSettings,
  onRevealImage,
}: WorkspaceInspectorProps) {
  const { formatDateTime, plural, t } = useTranslation()
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
                : t('inspector.saveFailed'),
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
    <section className="sn-inspector" aria-label={t('inspector.title')}>
      <header className="sn-panel-heading">
        <div>
          <div className="sn-panel-heading__title-row">
            <h2>{t('shell.details')}</h2>
            <span className="sn-panel-heading__right">
              {plural('library.noteCount', noteCount)}
            </span>
          </div>
          <p>
            {!activeNote
              ? t('inspector.noNoteSelected')
              : activeNote.isLocked
                ? t('note.locked')
                : activeNote.title}
          </p>
        </div>
        {onCollapse || onOpenSettings ? (
          <div className="sn-panel-heading__actions">
            {onOpenSettings ? (
              <button
                aria-label={t('inspector.openSettings')}
                className="sn-icon-button"
                onClick={onOpenSettings}
                title={t('shell.settings')}
                type="button"
              >
                <UiIcon name="settings" />
              </button>
            ) : null}
            {onCollapse ? (
              <button
                aria-label={t('inspector.collapse')}
                className="sn-icon-button"
                onClick={onCollapse}
                title={t('inspector.collapse')}
                type="button"
              >
                <UiIcon name="chevronRight" />
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="sn-inspector-tabs" role="tablist" aria-label={t('inspector.views')}>
        <button
          aria-selected={activeTab === 'properties'}
          className="sn-inspector-tab"
          onClick={() => setActiveTab('properties')}
          role="tab"
          type="button"
        >
          <UiIcon name="tag" />
          {t('inspector.tabProperties')}
        </button>
        <button
          aria-selected={activeTab === 'photos'}
          className="sn-inspector-tab"
          onClick={() => setActiveTab('photos')}
          role="tab"
          type="button"
        >
          <UiIcon name="image" />
          {t('inspector.tabPhotos')}
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
          {t('inspector.tabInfo')}
        </button>
      </div>

      {!activeNote ? (
        <div className="sn-inspector-empty">
          <UiIcon name="document" />
          <strong>{t('inspector.selectNote')}</strong>
          <p>
            {noteCount === 0
              ? t('inspector.selectNoteEmpty')
              : t('inspector.selectNoteHint')}
          </p>
        </div>
      ) : null}

      {activeNote && activeTab === 'properties' ? (
        <div className="sn-inspector-section sn-properties" role="tabpanel">
          {activeNote.isLocked ? (
            <div className="sn-inspector-empty sn-inspector-empty--compact">
              <UiIcon name="lock" />
              <strong>{t('inspector.propertiesLocked')}</strong>
              <p>{t('inspector.propertiesLockedHint')}</p>
            </div>
          ) : (
            <>
              <div className="sn-property-field">
                <span><UiIcon name="info" /> {t('inspector.status')}</span>
                <StatusPicker
                  onChange={(status) => void saveProperties({
                    ...properties,
                    status,
                  })}
                  value={properties.status}
                />
              </div>

              <section className="sn-tags-section" aria-label={t('inspector.pageTags')}>
                <div className="sn-property-heading">
                  <h3><UiIcon name="tag" /> {t('inspector.tags')}</h3>
                  <span>{properties.tags.length}/12</span>
                </div>
                {properties.tags.length > 0 ? (
                  <div className="sn-tag-list">
                    {properties.tags.map((tag) => (
                      <span className="sn-tag" key={tag}>
                        {tag}
                        <button
                          aria-label={t('inspector.removeTag', { tag })}
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
                  <p className="sn-property-empty">{t('inspector.noTags')}</p>
                )}
                <form className="sn-tag-entry" onSubmit={addTag}>
                  <input
                    aria-label={t('inspector.newTag')}
                    maxLength={32}
                    onChange={(event) => setTagDraft(event.target.value)}
                    placeholder={t('inspector.addTag')}
                    value={tagDraft}
                  />
                  <button disabled={!tagDraft.trim() || properties.tags.length >= 12} type="submit">
                    {t('inspector.add')}
                  </button>
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
              <strong>{t('inspector.photosLocked')}</strong>
              <p>{t('inspector.photosLockedHint')}</p>
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
            <div>
              <dt>{t('inspector.folder')}</dt>
              <dd><UiIcon name="folder" />{folderName ?? t('library.allNotes')}</dd>
            </div>
            <div>
              <dt>{t('inspector.updated')}</dt>
              <dd>
                {formatDateTime(activeNote.updatedAt, { ...dateOptions, ...timeOptions })}
              </dd>
            </div>
            <div>
              <dt>{t('inspector.privacy')}</dt>
              <dd>
                <UiIcon name={activeNote.isLocked ? 'lock' : 'shield'} />
                {activeNote.isLocked
                  ? t('inspector.privacyLocked')
                  : t('inspector.privacyLocal')}
              </dd>
            </div>
            <div>
              <dt>{t('inspector.created')}</dt>
              <dd>{formatDateTime(activeNote.createdAt, dateOptions)}</dd>
            </div>
          </dl>
          {onOpenHistory ? (
            <button className="sn-inspector-history" onClick={onOpenHistory} type="button">
              <UiIcon name="refresh" />
              {t('inspector.viewHistory')}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="sn-inspector-palette" aria-hidden="true"><span /><span /><span /><span /><span /><span /></div>
    </section>
  )
}
