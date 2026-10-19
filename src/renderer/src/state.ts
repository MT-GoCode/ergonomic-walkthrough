import { newCell, serializeDoc, type Cell, type Kind } from '../../shared/doc'
import * as ops from '../../shared/ops'

// editingId: the one markdown cell showing raw text.
// selectTo: the far end of a shift-click selection; the focused cell is the near end.
// defaultLang mirrors the setting main last broadcast; new code cells take it.
export type State = {
  cells: Cell[]
  focusId: string | null
  editingId: string | null
  selectTo: string | null
  defaultLang: string
  rev: number
}

export type Action =
  | { a: 'init'; cells: Cell[]; defaultLang: string }
  | { a: 'settings'; defaultLang: string }
  | { a: 'focus'; id: string }
  | { a: 'edit'; id: string | null }
  | { a: 'select'; id: string | null }
  | { a: 'insert'; id: string; mode: ops.Mode; kind: Kind }
  | { a: 'remove' | 'removeIndented' | 'toggle'; id: string }
  | { a: 'indent' | 'outdent'; id: string; to?: string }
  | { a: 'title' | 'body'; id: string; text: string }
  | { a: 'height'; id: string; h: 'fit' | number }

// The cells from i through the one named `to` (either direction), or just i.
function span(cells: Cell[], i: number, to: string | undefined): [number, number] {
  const k = to ? cells.findIndex((c) => c.id === to) : i
  return [Math.min(i, k), Math.max(i, k)]
}

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
  act: Exclude<Action, { a: 'init' | 'settings' | 'focus' | 'edit' | 'select' }>,
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
      return [ops.indent(cells, ...span(cells, i, act.to)), act.id]
    case 'outdent':
      return [ops.outdent(cells, ...span(cells, i, act.to)), act.id]
    case 'toggle':
      return [ops.toggleCollapse(cells, i), act.id]
    case 'title':
      return [ops.setTitle(cells, i, act.text), act.id]
    case 'body':
      return [ops.setBody(cells, i, act.text), act.id]
    case 'height':
      return [ops.setHeight(cells, i, act.h), act.id]
  }
}

function step(s: State, act: Action): State {
  if (act.a === 'init')
    return {
      cells: act.cells,
      focusId: null,
      editingId: null,
      selectTo: null,
      defaultLang: act.defaultLang,
      rev: 0
    }
  if (act.a === 'settings') return { ...s, defaultLang: act.defaultLang }
  if (act.a === 'focus') return { ...s, focusId: act.id }
  if (act.a === 'select') return { ...s, selectTo: act.id }
  if (act.a === 'edit') return { ...s, editingId: act.id }
  const [cells, focusId] = edit(s.cells, act, s.focusId, s.defaultLang)
  if (cells === s.cells) return s
  // A new markdown cell opens raw, ready for typing.
  const fresh = act.a === 'insert' && act.kind === 'md' ? focusId : s.editingId
  return { ...s, cells, focusId, editingId: fresh, rev: s.rev + 1 }
}

// Invariants, enforced after every action:
// - a markdown cell is raw only while it is the focused cell (focus moving to another cell
//   renders it; leaving the window keeps focusId, so it stays raw);
// - a selection is anchored at the focused cell, so moving focus elsewhere ends it, and both
//   ends must still exist.
export function reducer(s: State, act: Action): State {
  const n = step(s, act)
  const has = (id: string | null) => !!id && n.cells.some((c) => c.id === id)
  const keepSel = n.focusId === s.focusId || act.a === 'init' ? n.selectTo : null
  const selectTo = keepSel !== n.focusId && has(keepSel) && has(n.focusId) ? keepSel : null
  const editingId = n.editingId === n.focusId ? n.editingId : null
  return selectTo === n.selectTo && editingId === n.editingId ? n : { ...n, selectTo, editingId }
}

// The document store lives outside React so every applied edit reaches main in the same
// task as the input that caused it; main's flush round-trip then cannot overtake an edit.
let state: State = {
  cells: [],
  focusId: null,
  editingId: null,
  selectTo: null,
  defaultLang: '',
  rev: 0
}
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
