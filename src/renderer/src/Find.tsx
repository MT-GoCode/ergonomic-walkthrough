import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorView } from '@uiw/react-codemirror'
import type { Cell } from '../../shared/doc'
import { collapsedAbove } from '../../shared/ops'
import { dispatch, store } from './state'

type Match = { i: number; field: 'title' | 'body'; from: number; to: number }

// Every case-insensitive occurrence of q in every title and body, in document order.
function search(cells: Cell[], q: string): Match[] {
  if (!q) return []
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
  const out: Match[] = []
  cells.forEach((c, i) => {
    for (const field of ['title', 'body'] as const)
      for (const m of c[field].matchAll(re))
        out.push({ i, field, from: m.index, to: m.index + m[0].length })
  })
  return out
}

const cellEl = (id: string) => document.querySelector<HTMLElement>(`.cell[data-id="${id}"]`)!
const editorOf = (cell: HTMLElement) => {
  const dom = cell.querySelector<HTMLElement>('.cm-editor')
  return dom && EditorView.findFromDOM(dom)
}

// Brings a match into view: its cell becomes the focused one (which slides the canvas to it)
// and a code body selects it; `land` leaves the keyboard there instead of in the find bar.
function show(id: string, m: Match, land: boolean): void {
  const cell = cellEl(id)
  const title = cell.querySelector<HTMLInputElement>('.title')!
  title.focus({ preventScroll: true })
  const view = m.field === 'body' ? editorOf(cell) : null
  if (view) {
    view.dispatch({
      selection: { anchor: m.from, head: m.to },
      effects: EditorView.scrollIntoView(m.from, { y: 'center' })
    })
    if (land) view.focus()
  } else {
    cell.scrollIntoView({ block: 'center' })
    if (m.field === 'title') title.setSelectionRange(m.from, m.to)
  }
}

// ⇧⌘F: searches the document itself, so collapsed cells are found too. Each match opens
// only the collapsed cells above it (a view-only peek), so the next match folds them again.
export function Find({ ask, cells, close }: { ask: number; cells: Cell[]; close: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  // null until Enter moves it: a new query starts at the first match in or after the
  // focused cell.
  const [at, setAt] = useState<number | null>(null)
  const matches = useMemo(() => search(cells, q), [cells, q])
  const n = matches.length
  const start = () => {
    const focused = cells.findIndex((c) => c.id === store.get().focusId)
    return Math.max(
      0,
      matches.findIndex((x) => x.i >= focused)
    )
  }
  const k = n ? (at ?? start()) % n : 0
  const m = n ? matches[k] : undefined
  const id = m && cells[m.i].id

  useEffect(() => {
    input.current!.focus()
    input.current!.select()
  }, [ask])

  useEffect(() => {
    if (!m || !id) return
    dispatch({ a: 'peek', ids: collapsedAbove(cells, m.i) })
    // The peeked cells and their editors exist once React has committed, before this frame.
    const frame = requestAnimationFrame(() => {
      show(id, m, false)
      input.current!.focus()
    })
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, m?.field, m?.from, q])

  const step = (d: 1 | -1) => setAt((k + d + n) % n)
  return (
    <div className="find">
      <input
        ref={input}
        spellCheck={false}
        placeholder="Find"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setAt(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && n) step(e.shiftKey ? -1 : 1)
          else if (e.key === 'Escape') {
            close()
            if (m && id) show(id, m, true)
          } else return
          e.preventDefault()
        }}
      />
      <span className="count">
        {!q ? '' : n ? `${(k + 1).toLocaleString()} of ${n.toLocaleString()}` : 'No results'}
      </span>
    </div>
  )
}
