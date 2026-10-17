import { newCell, serializeDoc, type Cell, type Kind } from '../../shared/doc'
import * as ops from '../../shared/ops'

// editingId: the one markdown cell showing raw text.
// defaultLang mirrors the setting main last broadcast; new code cells take it.
export type State = {
  cells: Cell[]
  focusId: string | null
  editingId: string | null
  defaultLang: string
  rev: number
}

export type Action =
  | { a: 'init'; cells: Cell[]; defaultLang: string }
  | { a: 'settings'; defaultLang: string }
  | { a: 'focus'; id: string }
  | { a: 'edit'; id: string | null }
  | { a: 'insert'; id: string; mode: ops.Mode; kind: Kind }
  | { a: 'remove' | 'removeIndented' | 'indent' | 'outdent' | 'toggle'; id: string }
  | { a: 'title' | 'body' | 'lang'; id: string; text: string }
  | { a: 'height'; id: string; h: 'fit' | number }

// Focus lands on the visible cell just above the deleted one, so the keyboard keeps its place.
function afterDelete(before: Cell[], i: number, after: Cell[]): [Cell[], string | null] {
  const above = ops
    .visible(before)
    .filter((j) => j < i)
    .at(-1)
  return [after, above === undefined ? after[0].id : before[above].id]
}

// Returns the next cells and the next focused id.
function edit(
  cells: Cell[],
  act: Exclude<Action, { a: 'init' | 'settings' | 'focus' | 'edit' }>,
  focusId: string | null,
  lang: string
): [Cell[], string | null] {
  const i = cells.findIndex((c) => c.id === act.id)
  // A command from main can name a cell that was deleted before it arrived.
  if (i < 0) return [cells, focusId]
  switch (act.a) {
    case 'insert': {
      const slot = ops.insertModes(cells, i)[act.mode]
      if (!slot) return [cells, focusId]
      const cell = newCell(act.kind, slot.depth, lang)
      return [ops.insert(cells, i, slot, cell), cell.id]
    }
    case 'remove':
      return afterDelete(cells, i, ops.remove(cells, i, newCell('code', 0, lang)))
    case 'removeIndented':
      return afterDelete(cells, i, ops.removeWithIndented(cells, i, newCell('code', 0, lang)))
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
  if (act.a === 'init')
    return {
      cells: act.cells,
      focusId: null,
      editingId: null,
      defaultLang: act.defaultLang,
      rev: 0
    }
  if (act.a === 'settings') return { ...s, defaultLang: act.defaultLang }
  if (act.a === 'focus') return { ...s, focusId: act.id }
  if (act.a === 'edit') return { ...s, editingId: act.id }
  const [cells, focusId] = edit(s.cells, act, s.focusId, s.defaultLang)
  if (cells === s.cells) return s
  // A new markdown cell opens raw, ready for typing.
  const fresh = act.a === 'insert' && act.kind === 'md' ? focusId : s.editingId
  return { ...s, cells, focusId, editingId: fresh, rev: s.rev + 1 }
}

// The document store lives outside React so every applied edit reaches main in the same
// task as the input that caused it; main's flush round-trip then cannot overtake an edit.
let state: State = { cells: [], focusId: null, editingId: null, defaultLang: '', rev: 0 }
const listeners = new Set<() => void>()

export const store = {
  get: (): State => state,
  subscribe: (fn: () => void) => {
    listeners.add(fn)
    return () => void listeners.delete(fn)
  }
}

export function dispatch(act: Action): void {
  const next = reducer(state, act)
  if (next === state) return
  const edited = next.rev !== state.rev
  state = next
  if (edited) window.api.docChanged(serializeDoc(next.cells))
  listeners.forEach((fn) => fn())
}
