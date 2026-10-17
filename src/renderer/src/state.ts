import { createContext, useContext, type Dispatch } from 'react'
import { newCell, type Cell, type Kind } from '../../shared/doc'
import * as ops from '../../shared/ops'
import { DEFAULT_SETTINGS } from '../../shared/settings'

export type State = { cells: Cell[]; focusId: string | null; rev: number }

export type Action =
  | { a: 'init'; cells: Cell[] }
  | { a: 'focus'; id: string }
  | { a: 'insert'; id: string; mode: ops.Mode; kind: Kind }
  | { a: 'remove' | 'removeIndented' | 'indent' | 'outdent' | 'toggle'; id: string }
  | { a: 'title' | 'body' | 'lang'; id: string; text: string }
  | { a: 'height'; id: string; h: 'fit' | number }

const blank = (): Cell => newCell('code', 0, DEFAULT_SETTINGS.defaultLang)

function edit(cells: Cell[], act: Exclude<Action, { a: 'init' | 'focus' }>): [Cell[], string | null] {
  const i = cells.findIndex((c) => c.id === act.id)
  switch (act.a) {
    case 'insert': {
      const slot = ops.insertModes(cells, i)[act.mode]
      if (!slot) return [cells, null]
      const cell = newCell(act.kind, slot.depth, DEFAULT_SETTINGS.defaultLang)
      return [ops.insert(cells, i, slot, cell), cell.id]
    }
    case 'remove':
      return [ops.remove(cells, i, blank()), null]
    case 'removeIndented':
      return [ops.removeWithIndented(cells, i, blank()), null]
    case 'indent':
      return [ops.indent(cells, i), act.id]
    case 'outdent':
      return [ops.outdent(cells, i), act.id]
    case 'toggle':
      return [ops.toggleCollapse(cells, i), act.id]
    case 'title':
      return [ops.setTitle(cells, i, act.text), act.id]
    case 'body':
      return [ops.setBody(cells, i, act.text), act.id]
    case 'lang':
      return [ops.setLang(cells, i, act.text), act.id]
    case 'height':
      return [ops.setHeight(cells, i, act.h), act.id]
  }
}

export function reducer(s: State, act: Action): State {
  if (act.a === 'init') return { cells: act.cells, focusId: null, rev: 0 }
  if (act.a === 'focus') return { ...s, focusId: act.id }
  const [cells, focusId] = edit(s.cells, act)
  return cells === s.cells ? s : { cells, focusId: focusId ?? s.focusId, rev: s.rev + 1 }
}

export const DispatchCtx = createContext<Dispatch<Action>>(() => {})
export const useDispatch = (): Dispatch<Action> => useContext(DispatchCtx)
