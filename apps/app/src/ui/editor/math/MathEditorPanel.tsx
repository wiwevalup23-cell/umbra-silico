import katex from 'katex'
import { useEffect, useRef } from 'react'
import type { MathKind } from '../extensions'
import { UiIcon } from '@/ui/icons/ui/UiIcon'
import { useTranslation } from '@/ui/i18n/use-translation'

export type MathEditorDraft = {
  kind: MathKind
  latex: string
  mode: 'insert' | 'edit'
  pos: number | null
}

function MathPreview({ kind, latex }: { kind: MathKind; latex: string }) {
  const { t } = useTranslation()
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!previewRef.current) {
      return
    }

    if (!latex.trim()) {
      previewRef.current.replaceChildren()
      return
    }

    katex.render(latex, previewRef.current, {
      displayMode: kind === 'block',
      output: 'htmlAndMathml',
      strict: 'warn',
      throwOnError: false,
    })
  }, [kind, latex])

  return (
    <div
      aria-label={t('editor.equationPreview')}
      className="sn-math-editor__preview"
      data-empty={!latex.trim()}
      ref={previewRef}
    />
  )
}

type MathEditorPanelProps = {
  draft: MathEditorDraft
  onCancel: () => void
  onChange: (latex: string) => void
  onDelete: (() => void) | null
  onSave: () => void
}

export function MathEditorPanel({
  draft,
  onCancel,
  onChange,
  onDelete,
  onSave,
}: MathEditorPanelProps) {
  const { t } = useTranslation()

  return (
    <section aria-label={t('editor.equationEditor')} className="sn-math-editor">
      <span
        aria-hidden="true"
        className="sn-math-editor__mark"
        title={t(draft.kind === 'block' ? 'editor.equationBlock' : 'editor.inlineEquation')}
      >
        ∑
      </span>
      <label className="sn-math-editor__field">
        <span className="sn-sr-only">{t('editor.latexExpression')}</span>
        <input
          aria-label={t('editor.latexExpression')}
          autoFocus
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              onCancel()
            }

            if (event.key === 'Enter') {
              event.preventDefault()
              onSave()
            }
          }}
          placeholder={draft.kind === 'block' ? String.raw`\frac{a}{b} = c` : 'E = mc^2'}
          spellCheck={false}
          value={draft.latex}
        />
      </label>
      <MathPreview kind={draft.kind} latex={draft.latex} />
      <div className="sn-math-editor__actions">
        {onDelete ? (
          <button
            aria-label={t('editor.equationDelete')}
            className="sn-math-editor__delete"
            onClick={onDelete}
            title={t('editor.equationDelete')}
            type="button"
          >
            <UiIcon name="trash" />
          </button>
        ) : null}
        <button
          aria-label={t('editor.closeEquationEditor')}
          onClick={onCancel}
          title={t('editor.closeEquationEditor')}
          type="button"
        >
          <UiIcon name="close" />
        </button>
        <button
          aria-label={t(draft.mode === 'edit' ? 'editor.equationUpdate' : 'editor.equationInsert')}
          className="sn-math-editor__save"
          disabled={!draft.latex.trim()}
          onClick={onSave}
          title={t(draft.mode === 'edit' ? 'editor.equationUpdate' : 'editor.equationInsert')}
          type="button"
        >
          <UiIcon name="check" />
        </button>
      </div>
    </section>
  )
}
