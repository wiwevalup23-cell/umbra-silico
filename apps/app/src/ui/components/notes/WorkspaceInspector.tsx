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
import { StatusGlyph } from '@/ui/icons/status/StatusGlyph'
import { propertyMarkerOptions } from '@/ui/note-property-presentation'
import { SquircleButton } from '@/ui/components/silicon/SquircleButton'
import { NoteImageGallery } from './NoteImageGallery'
import { MarkerPicker } from './MarkerPicker'
import { StatusPicker } from './StatusPicker'

type WorkspaceInspectorProps = {
  activeNote: NoteDetail | null
  folderName?: string
  imageResolver?: ImageSourceResolver | null
  noteCount: number
  noteImages?: NoteImageListItem[]
  onChangeProperties?: (noteId: NoteDetail['id'], properties: NoteProperties) => Promise<unknown>
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
  const { formatDateTime, t } = useTranslation()
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
      {/* The same small window titlebar as the library's: the name and an
          engraved ridge; which note it describes goes on the line below. */}
      <header className="sn-panel-heading sn-panel-heading--titlebar">
        <div>
          <div className="sn-panel-heading__title-row">
            <h2>{t('shell.details')}</h2>
            <span aria-hidden="true" className="sn-panel-heading__ridge" />
          </div>
        </div>
        {onCollapse || onOpenSettings ? (
          <div className="sn-panel-heading__actions">
            {onOpenSettings ? (
              <SquircleButton
                aria-label={t('inspector.openSettings')}
                icon="settings"
                onClick={onOpenSettings}
                title={t('shell.settings')}
              />
            ) : null}
            {onCollapse ? (
              <SquircleButton
                aria-label={t('inspector.collapse')}
                tooltip={t('inspector.collapse')}
                className="sn-panel-collapse-button"
                legacyIcon="chevronRight"
                onClick={onCollapse}
              />
            ) : null}
          </div>
        ) : null}
      </header>

      <p className="sn-inspector-subject">
        {!activeNote
          ? t('inspector.noNoteSelected')
          : activeNote.isLocked
            ? t('note.locked')
            : activeNote.title.trim() || t('note.untitled')}
      </p>

      <div className="sn-inspector-tabs sn-tabs" role="tablist" aria-label={t('inspector.views')}>
        <button
          aria-selected={activeTab === 'properties'}
          className="sn-inspector-tab sn-tabs__tab"
          onClick={() => setActiveTab('properties')}
          role="tab"
          type="button"
        >
          <UiIcon className="sn-icon sn-icon--16" name="tag" />
          {t('inspector.tabProperties')}
        </button>
        <button
          aria-selected={activeTab === 'photos'}
          className="sn-inspector-tab sn-tabs__tab"
          onClick={() => setActiveTab('photos')}
          role="tab"
          type="button"
        >
          <UiIcon className="sn-icon sn-icon--16" name="image" />
          {t('inspector.tabPhotos')}
          {!activeNoteIsLocked && noteImages.length > 0 ? (
            <span className="sn-inspector-tab__badge">{noteImages.length}</span>
          ) : null}
        </button>
        <button
          aria-selected={activeTab === 'info'}
          className="sn-inspector-tab sn-tabs__tab"
          onClick={() => setActiveTab('info')}
          role="tab"
          type="button"
        >
          <UiIcon className="sn-icon sn-icon--16" name="info" />
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
                <span>{t('inspector.status')}</span>
                <StatusPicker
                  onChange={(status) => void saveProperties({
                    ...properties,
                    status,
                  })}
                  value={properties.status}
                />
              </div>

              <section className="sn-markers-section" aria-label={t('marker.section')}>
                <div className="sn-property-heading">
                  <h3>{t('marker.section')}</h3>
                  <span>{properties.markers.length}/13</span>
                </div>
                {properties.markers.length > 0 ? (
                  <ul className="sn-selected-markers" aria-label={t('marker.selected')}>
                    {propertyMarkerOptions.filter((option) => properties.markers.includes(option.value))
                      .map((option) => (
                        <li
                          className="sn-chip sn-chip--status"
                          data-tone={`marker.${option.value}`}
                          key={option.value}
                        >
                          <StatusGlyph symbol={option.icon} />
                          {t(option.labelKey)}
                        </li>
                      ))}
                  </ul>
                ) : <p className="sn-property-empty">{t('marker.none')}</p>}
                <details className="sn-marker-disclosure sn-disclosure" key={activeNoteId}>
                  <summary>{t('marker.edit')}</summary>
                  <p className="sn-property-empty">{t('marker.hint')}</p>
                  <MarkerPicker
                    onChange={(markers) => void saveProperties({
                      ...properties,
                      markers,
                    })}
                    value={properties.markers}
                  />
                </details>
              </section>

              <section className="sn-tags-section" aria-label={t('inspector.pageTags')}>
                <div className="sn-property-heading">
                  <h3>{t('inspector.tags')}</h3>
                  <span>{properties.tags.length}/12</span>
                </div>
                {properties.tags.length > 0 ? (
                  <div className="sn-tag-list">
                    {properties.tags.map((tag) => (
                      <span className="sn-tag sn-chip sn-chip--tag" key={tag}>
                        {tag}
                        <button
                          aria-label={t('inspector.removeTag', { tag })}
                          className="sn-chip__remove"
                          onClick={() => void saveProperties({
                            ...properties,
                            tags: properties.tags.filter((candidate) => candidate !== tag),
                          })}
                          type="button"
                        >
                          <UiIcon className="sn-icon sn-icon--16" name="close" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
                <form className="sn-tag-entry" onSubmit={addTag}>
                  <input
                    aria-label={t('inspector.newTag')}
                    className="sn-field"
                    maxLength={32}
                    onChange={(event) => setTagDraft(event.target.value)}
                    placeholder={t('inspector.addTag')}
                    value={tagDraft}
                  />
                  <button
                    className="sn-btn"
                    disabled={!tagDraft.trim() || properties.tags.length >= 12}
                    type="submit"
                  >
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
              <dd>
                <UiIcon className="sn-icon sn-icon--16" name="folder" />
                {folderName ?? t('library.unfiled')}
              </dd>
            </div>
            <div>
              <dt>{t('inspector.updated')}</dt>
              <dd className="sn-inspector-list__data">
                {formatDateTime(activeNote.updatedAt, { ...dateOptions, ...timeOptions })}
              </dd>
            </div>
            <div>
              <dt>{t('inspector.privacy')}</dt>
              <dd>
                <UiIcon className="sn-icon sn-icon--16" name={activeNote.isLocked ? 'lock' : 'shield'} />
                {activeNote.isLocked
                  ? t('inspector.privacyLocked')
                  : t('inspector.privacyLocal')}
              </dd>
            </div>
            <div>
              <dt>{t('inspector.created')}</dt>
              <dd className="sn-inspector-list__data">{formatDateTime(activeNote.createdAt, dateOptions)}</dd>
            </div>
          </dl>
          {onOpenHistory ? (
            <button className="sn-inspector-history sn-btn" onClick={onOpenHistory} type="button">
              <UiIcon className="sn-icon sn-icon--16" name="history" />
              {t('inspector.viewHistory')}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="sn-inspector-palette" aria-hidden="true"><span /><span /><span /><span /><span /><span /></div>
    </section>
  )
}
