import { useEffect, useState, type RefObject } from 'react'

// The page never scrolls sideways by itself. When a cell gains focus (or the focused cell
// changes shape) and it is not fully inside the window horizontally, the canvas slides so
// the cell's left edge sits at the window's left edge. Nothing else moves it.
export function useReveal(
  scroller: RefObject<HTMLDivElement | null>,
  track: RefObject<HTMLDivElement | null>,
  layoutKey: unknown
): number {
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    const sc = scroller.current!
    const tr = track.current!
    const reveal = (cell: HTMLElement | null | undefined) => {
      if (!cell) return
      const left = cell.getBoundingClientRect().left - tr.getBoundingClientRect().left
      // A markdown cell's resize handle sits 10px + one line beyond its right edge.
      const lh = parseFloat(getComputedStyle(tr).lineHeight)
      const right = left + cell.offsetWidth + (cell.classList.contains('md') ? 10 + lh : 0)
      setOffset((o) => (left < o || right > o + sc.clientWidth ? left : o))
    }
    const onFocus = (e: FocusEvent) => reveal((e.target as Element).closest<HTMLElement>('.cell'))
    const focused = () => document.activeElement?.closest<HTMLElement>('.cell')
    const resize = new ResizeObserver(() => reveal(focused()))
    resize.observe(sc)
    tr.addEventListener('focusin', onFocus)
    reveal(focused())
    return () => {
      resize.disconnect()
      tr.removeEventListener('focusin', onFocus)
    }
  }, [scroller, track, layoutKey])

  return offset
}
