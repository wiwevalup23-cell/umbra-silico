import { useEffect, useRef } from 'react'

type ResizerProps = {
  direction?: 'left' | 'right'
  onResize: (delta: number) => void
  onResizeEnd?: () => void
}

export function Resizer({ direction = 'right', onResize, onResizeEnd }: ResizerProps) {
  const isResizing = useRef(false)
  const startX = useRef(0)

  useEffect(() => {
    function handlePointerMove(e: PointerEvent) {
      if (!isResizing.current) return

      const delta = direction === 'right'
        ? e.clientX - startX.current
        : startX.current - e.clientX

      onResize(delta)
      startX.current = e.clientX
    }

    function handlePointerUp() {
      if (isResizing.current) {
        isResizing.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        if (onResizeEnd) onResizeEnd()
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [direction, onResize, onResizeEnd])

  return (
    <div
      aria-label="Resize panel"
      aria-orientation="vertical"
      className={`sn-resizer sn-resizer--${direction}`}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 32 : 16
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          onResize(direction === 'right' ? -step : step)
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault()
          onResize(direction === 'right' ? step : -step)
        }
      }}
      onPointerDown={(e) => {
        isResizing.current = true
        startX.current = e.clientX
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      role="separator"
      tabIndex={0}
    >
      <span aria-hidden="true" />
    </div>
  )
}
