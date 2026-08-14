import { Extension } from '@tiptap/core'
import type { EditorState } from '@tiptap/pm/state'

const pageOffsetMin = 8
const pageOffsetMax = 132
/* The page "margins" are really the measure: what makes a document readable is
   how many characters land on a line, not how many pixels sit beside them. A
   pixel gap keeps the same size while the column behind it grows with the
   window, so the line quietly runs past the point the eye can track. Stored in
   `ch` — the width of "0" in the body face — so it follows the type size. */
const pageMeasureMin = 40
const pageMeasureMax = 100
const defaultPageMeasure = 66
const defaultPageHeaderOffset = 48
/* Deliberately larger than the top: a page with equal top and bottom reads as
   sagging, because the optical centre sits above the geometric one. */
const defaultPageFooterOffset = 96

export {
  defaultPageFooterOffset,
  defaultPageHeaderOffset,
  defaultPageMeasure,
  pageMeasureMax,
  pageMeasureMin,
  pageOffsetMax,
  pageOffsetMin,
}

export type PageLayoutAttrs = {
  pageFooterOffset: number
  pageHeaderOffset: number
  pageMeasure: number
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageLayout: {
      adjustPageFooterOffset: (delta: number) => ReturnType
      adjustPageHeaderOffset: (delta: number) => ReturnType
      setPageFooterOffset: (offset: number) => ReturnType
      setPageHeaderOffset: (offset: number) => ReturnType
      setPageMeasure: (margin: number) => ReturnType
    }
  }
}

export const defaultPageLayout: PageLayoutAttrs = {
  pageFooterOffset: defaultPageFooterOffset,
  pageHeaderOffset: defaultPageHeaderOffset,
  pageMeasure: defaultPageMeasure,
}

function clampPageOffset(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(parsed)) {
    return pageOffsetMin
  }

  return Math.min(pageOffsetMax, Math.max(pageOffsetMin, Math.round(parsed)))
}

function clampPageMeasure(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(parsed)) {
    return defaultPageMeasure
  }

  return Math.min(pageMeasureMax, Math.max(pageMeasureMin, Math.round(parsed)))
}

export function getPageLayout(state: EditorState): PageLayoutAttrs {
  return {
    pageFooterOffset: clampPageOffset(
      state.doc.attrs.pageFooterOffset ?? defaultPageFooterOffset,
    ),
    pageHeaderOffset: clampPageOffset(
      state.doc.attrs.pageHeaderOffset ?? defaultPageHeaderOffset,
    ),
    pageMeasure: clampPageMeasure(state.doc.attrs.pageMeasure ?? defaultPageMeasure),
  }
}

export const PageLayout = Extension.create({
  name: 'pageLayout',

  addGlobalAttributes() {
    return [
      {
        types: ['doc'],
        attributes: {
          pageFooterOffset: {
            default: defaultPageFooterOffset,
          },
          pageHeaderOffset: {
            default: defaultPageHeaderOffset,
          },
          pageMeasure: {
            default: defaultPageMeasure,
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      adjustPageFooterOffset:
        (delta) =>
        ({ dispatch, state }) => {
          const currentLayout = getPageLayout(state)

          if (dispatch) {
            dispatch(
              state.tr.setDocAttribute(
                'pageFooterOffset',
                clampPageOffset(currentLayout.pageFooterOffset + delta),
              ),
            )
          }

          return true
        },
      adjustPageHeaderOffset:
        (delta) =>
        ({ dispatch, state }) => {
          const currentLayout = getPageLayout(state)

          if (dispatch) {
            dispatch(
              state.tr.setDocAttribute(
                'pageHeaderOffset',
                clampPageOffset(currentLayout.pageHeaderOffset + delta),
              ),
            )
          }

          return true
        },
      setPageFooterOffset:
        (offset) =>
        ({ dispatch, state }) => {
          if (dispatch) {
            dispatch(
              state.tr.setDocAttribute('pageFooterOffset', clampPageOffset(offset)),
            )
          }

          return true
        },
      setPageHeaderOffset:
        (offset) =>
        ({ dispatch, state }) => {
          if (dispatch) {
            dispatch(
              state.tr.setDocAttribute('pageHeaderOffset', clampPageOffset(offset)),
            )
          }

          return true
        },
      setPageMeasure:
        (margin) =>
        ({ dispatch, state }) => {
          if (dispatch) {
            dispatch(
              state.tr.setDocAttribute('pageMeasure', clampPageMeasure(margin)),
            )
          }

          return true
        },
    }
  },
})
