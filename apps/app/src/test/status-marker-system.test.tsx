import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { notePropertiesSchema, notePropertyMarkerValues } from '@/shared/contracts'
import { MarkerPicker } from '@/ui/components/notes/MarkerPicker'
import { StatusMarkerGlyph } from '@/ui/icons/status-marker'
import {
  nocturneStatusMarkerSubstitutions,
  statusMarkerIconParts,
} from '@/ui/icons/status-marker/status-marker-icon-data'
import { propertyMarkerOptions, propertyStatusOptions } from '@/ui/note-property-presentation'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const cleanupTasks: Array<() => void> = []

function render(element: ReactNode) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => root.render(element))
  cleanupTasks.push(() => {
    act(() => root.unmount())
    container.remove()
  })
  return container
}

afterEach(() => {
  while (cleanupTasks.length) cleanupTasks.pop()?.()
})

describe('Umbra status and marker family', () => {
  it('ships the complete Core family and the separate Nocturne substitutions', () => {
    expect(propertyStatusOptions).toHaveLength(9)
    expect(propertyMarkerOptions).toHaveLength(13)
    expect(Object.keys(statusMarkerIconParts).filter((name) => name.startsWith('nocturne.')))
      .toHaveLength(4)
    expect(Object.keys(nocturneStatusMarkerSubstitutions)).toHaveLength(4)
    expect(Object.keys(statusMarkerIconParts)).toHaveLength(26)
  })

  it('renders the production geometry on a native 24 px grid', () => {
    const container = render(<StatusMarkerGlyph name="marker.idea" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg?.getAttribute('stroke-width')).toBe('1.6')
    expect(svg?.querySelectorAll('path')).toHaveLength(3)
  })

  it('persists several independent markers and toggles them separately', () => {
    const onChange = vi.fn()
    const container = render(<MarkerPicker onChange={onChange} value={['idea']} />)
    expect(container.querySelectorAll('button')).toHaveLength(notePropertyMarkerValues.length)
    expect(container.querySelector('button[aria-label="Idea / insight"]')?.getAttribute('aria-pressed'))
      .toBe('true')

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Important"]')?.click())
    expect(onChange).toHaveBeenCalledWith(['idea', 'important'])
  })

  it('defaults markers for old stored notes without changing their other properties', () => {
    expect(notePropertiesSchema.parse({ status: 'active', tags: ['Legacy'] })).toEqual({
      kind: 'standard',
      markers: [],
      status: 'active',
      tags: ['Legacy'],
    })
  })
})
