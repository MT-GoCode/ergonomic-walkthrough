import { useMemo, useRef, type ReactNode } from 'react'
import { insertModes, subtreeEnd } from '../../shared/ops'
import { useAnchor } from './anchor'
import { CellView, LangList } from './Cell'
import type { Settings } from '../../shared/settings'
import { dispatch, type State } from './state'

type Props = Pick<State, 'cells' | 'focusId' | 'editingId'> & { settings: Settings }

export function Canvas({ cells, focusId, editingId, settings }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  // Anything that changes cell geometry re-anchors: content, settings, raw/rendered markdown.
  const layout = useMemo(() => [cells, settings, editingId], [cells, settings, editingId])
  const offset = useAnchor(scroller, track, layout)
  // Flat list → nested groups: each cell is followed by its subtree in a guide column.
  const range = (from: number, to: number): ReactNode[] => {
    const out: ReactNode[] = []
    for (let i = from; i < to;) {
      const c = cells[i]
      const end = subtreeEnd(cells, i)
      const modes = insertModes(cells, i)
      out.push(
        <CellView
          key={c.id}
          cell={c}
          focused={c.id === focusId}
          editing={c.id === editingId}
          canIn={!!modes.in}
          canOut={!!modes.out}
        />
      )
      if (end > i + 1)
        out.push(
          <div className="group" key={c.id + '/kids'}>
            <div className="guide" onClick={() => dispatch({ a: 'toggle', id: c.id })} />
            <div className="kids">
              {c.collapsed ? (
                <div className="folded" onClick={() => dispatch({ a: 'toggle', id: c.id })}>
                  ▸ {end - i - 1} cells
                </div>
              ) : (
                range(i + 1, end)
              )}
            </div>
          </div>
        )
      i = end
    }
    return out
  }
  // scroller (vertical only) > clip (never transformed, not a scroll container) > track (slides).
  return (
    <div className="scroller" ref={scroller}>
      <div className="clip">
        <div className="track" ref={track} style={{ transform: `translateX(${-offset}px)` }}>
          <LangList />
          {range(0, cells.length)}
        </div>
      </div>
    </div>
  )
}
