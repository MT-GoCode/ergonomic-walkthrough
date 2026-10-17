import type { ReactNode } from 'react'
import type { Cell } from '../../shared/doc'
import { subtreeEnd } from '../../shared/ops'
import { CellView, LangList } from './Cell'
import { useDispatch } from './state'

export function Canvas({ cells, focusId }: { cells: Cell[]; focusId: string | null }): ReactNode {
  const dispatch = useDispatch()
  // Flat list → nested groups: each cell is followed by its subtree in a guide column.
  const range = (from: number, to: number): ReactNode[] => {
    const out: ReactNode[] = []
    for (let i = from; i < to;) {
      const c = cells[i]
      const end = subtreeEnd(cells, i)
      out.push(<CellView key={c.id} cell={c} focused={c.id === focusId} />)
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
  return (
    <div className="canvas">
      <LangList />
      {range(0, cells.length)}
    </div>
  )
}
