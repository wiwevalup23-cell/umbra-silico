import { useLayoutEffect, useRef, type ComponentProps } from 'react'

/** A wrapping title that grows to two lines, then remains scrollable. */
export function NoteTitleField(props: ComponentProps<'textarea'>) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const field = ref.current
    if (!field) return
    let lastWidth = -1
    const resize = () => {
      const lineHeight = Number.parseFloat(window.getComputedStyle(field).lineHeight) || 38
      field.style.height = '0px'
      field.style.height = `${Math.min(Math.max(field.scrollHeight, lineHeight), lineHeight * 2)}px`
    }
    resize()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(([entry]) => {
      // Ignore our own height change to avoid a ResizeObserver loop.
      if (entry.contentRect.width !== lastWidth) {
        lastWidth = entry.contentRect.width
        resize()
      }
    })
    observer?.observe(field)
    return () => observer?.disconnect()
  }, [props.value])

  return <textarea {...props} ref={ref} rows={1} />
}
