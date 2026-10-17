import { useEffect, useRef, useState, type RefObject } from 'react'

// The page never scrolls sideways. The cell crossing the top 10% line (or the
// focused cell, until the user scrolls) slides into view when its indent makes
// it too wide: offset = clamp(left + width − viewport, 0, left).
export function useAnchor(
  scroller: RefObject<HTMLDivElement | null>,
  track: RefObject<HTMLDivElement | null>,
  layoutKey: unknown
): number {
  const [offset, setOffset] = useState(0)
  const pinned = useRef<HTMLElement | null>(null)
  const refreshRef = useRef<() => void>(() => {})

  useEffect(() => {
    const sc = scroller.current!
    const tr = track.current!
    const lineHeight = () => parseFloat(getComputedStyle(tr).lineHeight)
    const compute = (cell: HTMLElement) => {
      const left = cell.getBoundingClientRect().left - tr.getBoundingClientRect().left
      // A markdown cell's resize handle sits 10px + one line beyond its right edge.
      const width = cell.offsetWidth + (cell.classList.contains('md') ? 10 + lineHeight() : 0)
      setOffset(Math.min(Math.max(left + width - sc.clientWidth, 0), left))
    }
    const pick = () => {
      const cells = [...tr.querySelectorAll<HTMLElement>('.cell')]
      const line = sc.getBoundingClientRect().top + 0.1 * sc.clientHeight
      let lo = 0
      let hi = cells.length - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (cells[mid].getBoundingClientRect().top <= line) lo = mid
        else hi = mid - 1
      }
      if (cells.length) compute(cells[lo])
    }
    const refresh = () => (pinned.current?.isConnected ? compute(pinned.current) : pick())
    refreshRef.current = refresh
    let frame = 0
    const onScroll = () => {
      if (pinned.current || frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        pick()
      })
    }
    const unpin = () => (pinned.current = null)
    const onFocus = (e: FocusEvent) => {
      pinned.current = (e.target as Element).closest<HTMLElement>('.cell')
      if (pinned.current) compute(pinned.current)
    }
    const resize = new ResizeObserver(refresh)
    resize.observe(sc)
    sc.addEventListener('scroll', onScroll)
    sc.addEventListener('wheel', unpin)
    sc.addEventListener('pointerdown', unpin)
    tr.addEventListener('focusin', onFocus)
    refresh()
    return () => {
      resize.disconnect()
      sc.removeEventListener('scroll', onScroll)
      sc.removeEventListener('wheel', unpin)
      sc.removeEventListener('pointerdown', unpin)
      tr.removeEventListener('focusin', onFocus)
      cancelAnimationFrame(frame)
    }
  }, [scroller, track])

  useEffect(() => refreshRef.current(), [layoutKey])

  return offset
}
