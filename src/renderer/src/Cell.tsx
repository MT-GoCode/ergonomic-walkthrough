import { memo, useEffect, useRef, useState, type PointerEvent } from 'react'
import type { Cell, Kind } from '../../shared/doc'
import type { Mode } from '../../shared/ops'
import { CodeBody } from './CodeBody'
import { titleKey } from './focus'
import { LANGS, langNamed } from './langs'
import { MdBody } from './MdBody'
import { dispatch } from './state'

// One datalist shared by every cell: per-cell option lists would put 143 × cells
// nodes in the DOM, and style recalc over them dominates opening a large trace.
export const LangList = (): React.JSX.Element => (
  <datalist id="langs">
    {LANGS.map((n) => (
      <option key={n} value={n} />
    ))}
  </datalist>
)

// Type to filter; only an exact language name is committed, anything else reverts on blur.
function LangInput({ id, lang }: { id: string; lang: string }): React.JSX.Element {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      className="lang"
      list="langs"
      spellCheck={false}
      value={draft ?? lang}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const name = langNamed(e.target.value)
        if (name) dispatch({ a: 'lang', id, text: name })
        setDraft(name ? null : e.target.value)
      }}
      onBlur={() => setDraft(null)}
    />
  )
}

type Props = { cell: Cell; focused: boolean; editing: boolean; canIn: boolean; canOut: boolean }

export const CellView = memo(function CellView({ cell, focused, editing, canIn, canOut }: Props) {
  const id = cell.id
  const title = useRef<HTMLInputElement>(null)
  // A cell mounts focused when it was just created or just moved by Tab/Shift+Tab.
  useEffect(() => {
    if (focused && !editing) title.current!.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div
      className={`cell ${cell.kind}${focused ? ' focused' : ''}`}
      data-id={id}
      onFocus={() => focused || dispatch({ a: 'focus', id })}
    >
      <div className="titlebar">
        <input
          ref={title}
          className="title"
          spellCheck={false}
          value={cell.title}
          onChange={(e) => dispatch({ a: 'title', id, text: e.target.value })}
          onKeyDown={(e) => titleKey(e, dispatch)}
        />
        {cell.kind === 'code' && <LangInput id={id} lang={cell.lang} />}
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
