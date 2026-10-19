import { memo, useEffect, useRef, type PointerEvent } from 'react'
import type { Cell, Kind } from '../../shared/doc'
import type { Mode } from '../../shared/ops'
import { CodeBody } from './CodeBody'
import { titleKey } from './focus'
import { MdBody } from './MdBody'
import { dispatch } from './state'

type Props = {
  cell: Cell
  focused: boolean
  editing: boolean
  selected: boolean
  canIn: boolean
  canOut: boolean
}

export const CellView = memo(function CellView({
  cell,
  focused,
  editing,
  selected,
  canIn,
  canOut
}: Props) {
  const id = cell.id
  const title = useRef<HTMLInputElement>(null)
  const root = useRef<HTMLDivElement>(null)
  // Keyboard focus follows the focused cell when it becomes focused from outside it: a new
  // cell, one remounted by Tab/Shift+Tab, or the neighbour of a deleted cell.
  useEffect(() => {
    if (focused && !editing && !root.current!.contains(document.activeElement))
      title.current!.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused])
  return (
    <div
      ref={root}
      className={`cell ${cell.kind}${focused ? ' focused' : ''}${selected ? ' selected' : ''}`}
      data-id={id}
      onFocus={() => focused || dispatch({ a: 'focus', id })}
      // Shift-click on another cell selects the range from the focused cell to it, keeping
      // keyboard focus where it is; any plain click ends a selection.
      onMouseDown={(e) => {
        if (!e.shiftKey) return dispatch({ a: 'select', id: null })
        if (focused || !document.activeElement?.closest('.cell')) return
        e.preventDefault()
        dispatch({ a: 'select', id })
      }}
    >
      <div className="titlebar">
        <input
          ref={title}
          className="title"
          spellCheck={false}
          placeholder={cell.kind === 'code' ? 'file:line' : 'note'}
          value={cell.title}
          onChange={(e) => dispatch({ a: 'title', id, text: e.target.value })}
          onKeyDown={(e) => titleKey(e, dispatch)}
        />
        <button className="more" tabIndex={-1} onClick={() => window.api.popupCellMenu(id)}>
          ⋯
        </button>
      </div>
      {cell.kind === 'code' ? <CodeBody cell={cell} /> : <MdBody cell={cell} editing={editing} />}
      <InsertStrip id={id} canIn={canIn} canOut={canOut} resizable={cell.kind === 'md'} />
    </div>
  )
})

const BUTTONS: [Mode, Kind, string][] = [
  ['same', 'code', '+ Code'],
  ['same', 'md', '+ MD'],
  ['in', 'code', '+ Code ⇥'],
  ['in', 'md', '+ MD ⇥'],
  ['out', 'code', '+ Code ⇤'],
  ['out', 'md', '+ MD ⇤']
]

// A half-line hover zone straddling the bottom border. Disabled ⇥ buttons stay
// in place so the others never shift under the pointer; ⇤ exists only at a group's end.
function InsertStrip({
  id,
  canIn,
  canOut,
  resizable
}: {
  id: string
  canIn: boolean
  canOut: boolean
  resizable: boolean
}) {
  return (
    <div className="strip">
      <div className="btns">
        {BUTTONS.filter(([mode]) => mode !== 'out' || canOut).map(([mode, kind, label]) => (
          <button
            key={mode + kind}
            tabIndex={-1}
            disabled={mode === 'in' && !canIn}
            onClick={() => dispatch({ a: 'insert', id, mode, kind })}
          >
            {label}
          </button>
        ))}
      </div>
      {resizable && <ResizeHandle id={id} />}
    </div>
  )
}

// Drag snaps to whole lines, from 1 line up to what fits in the window under a title bar.
function ResizeHandle({ id }: { id: string }) {
  const drag = useRef<{ y: number; lines: number; lh: number; max: number } | null>(null)
  const down = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.closest('.cell')!.querySelector<HTMLElement>('.mdbox')!
    const lh = parseFloat(getComputedStyle(box).lineHeight)
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = {
      y: e.clientY,
      lines: box.clientHeight / lh,
      lh,
      max: Math.floor(parseFloat(getComputedStyle(box).maxHeight) / lh)
    }
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const h = Math.min(Math.max(Math.round(d.lines + (e.clientY - d.y) / d.lh), 1), d.max)
    dispatch({ a: 'height', id, h })
  }
  return (
    <div
      className="handle"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={() => (drag.current = null)}
      onDoubleClick={() => dispatch({ a: 'height', id, h: 'fit' })}
    >
      ⇕
    </div>
  )
}
