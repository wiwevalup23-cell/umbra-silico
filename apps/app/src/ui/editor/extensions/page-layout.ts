import { Extension } from '@tiptap/core'
import type { EditorState } from '@tiptap/pm/state'
import { readNumber } from './read-number'

const pageOffsetMin = 32
const pageOffsetMax = 180
const pageSideMarginMin = 48
const pageSideMarginMax = 96
const defaultPageSideMargin = 64
const defaultPageHeaderOffset = 56
const defaultPageFooterOffset = 88
const currentPageLayoutVersion = 3

export {
  currentPageLayoutVersion,
  defaultPageFooterOffset,
  defaultPageHeaderOffset,
  defaultPageSideMargin,
  pageOffsetMax,
  pageOffsetMin,
  pageSideMarginMax,
  pageSideMarginMin,
}

export type PageLayoutAttrs = {
  pageFooterOffset: number
  pageHeaderOffset: number
  pageSideMargin: number
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageLayout: {
      setPageLayout: (layout: Partial<PageLayoutAttrs>) => ReturnType
      setPageFooterOffset: (offset: number) => ReturnType
      setPageHeaderOffset: (offset: number) => ReturnType
      setPageSideMargin: (margin: number) => ReturnType
    }
  }
}

export const defaultPageLayout: PageLayoutAttrs = {
  pageFooterOffset: defaultPageFooterOffset,
  pageHeaderOffset: defaultPageHeaderOffset,
  pageSideMargin: defaultPageSideMargin,
}

function clampPageOffset(value: unknown): number {
  const parsed = readNumber(value)

  if (parsed === null) {
    return pageOffsetMin
  }

  return Math.min(pageOffsetMax, Math.max(pageOffsetMin, Math.round(parsed)))
}

function clampPageSideMargin(value: unknown): number {
  const parsed = readNumber(value)

  if (parsed === null) {
    return defaultPageSideMargin
  }

  return Math.min(
    pageSideMarginMax,
    Math.max(pageSideMarginMin, Math.round(parsed)),
  )
}

export function getPageLayout(state: EditorState): PageLayoutAttrs {
  return {
    pageFooterOffset: clampPageOffset(
      state.doc.attrs.pageFooterOffset ?? defaultPageFooterOffset,
    ),
    pageHeaderOffset: clampPageOffset(
      state.doc.attrs.pageHeaderOffset ?? defaultPageHeaderOffset,
    ),
    pageSideMargin: clampPageSideMargin(
      state.doc.attrs.pageSideMargin ?? defaultPageSideMargin,
    ),
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
          pageSideMargin: {
            default: defaultPageSideMargin,
          },
          pageLayoutVersion: {
            default: currentPageLayoutVersion,
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setPageLayout:
        (layout) =>
        ({ dispatch, state }) => {
          if (dispatch) {
            let transaction = state.tr

            if (layout.pageSideMargin !== undefined) {
              transaction = transaction.setDocAttribute(
                'pageSideMargin',
                clampPageSideMargin(layout.pageSideMargin),
              )
            }
            if (layout.pageHeaderOffset !== undefined) {
              transaction = transaction.setDocAttribute(
                'pageHeaderOffset',
                clampPageOffset(layout.pageHeaderOffset),
              )
            }
            if (layout.pageFooterOffset !== undefined) {
              transaction = transaction.setDocAttribute(
                'pageFooterOffset',
                clampPageOffset(layout.pageFooterOffset),
              )
            }

            dispatch(transaction)
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
      setPageSideMargin:
        (margin) =>
        ({ dispatch, state }) => {
          if (dispatch) {
            dispatch(
              state.tr.setDocAttribute(
                'pageSideMargin',
                clampPageSideMargin(margin),
              ),
            )
          }

          return true
        },
    }
  },
})
