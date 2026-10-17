import { memo, useState } from 'react'
import { languages } from '@codemirror/language-data'
import type { Cell } from '../../shared/doc'
import { CodeBody } from './CodeBody'
import { MdBody } from './MdBody'
import { useDispatch } from './state'

const LANGS = languages.map((l) => l.name).sort((a, b) => a.localeCompare(b))
const LANG_SET = new Set(LANGS)

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
  const dispatch = useDispatch()
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      className="lang"
      list="langs"
      spellCheck={false}
      value={draft ?? lang}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const v = e.target.value
        if (LANG_SET.has(v)) dispatch({ a: 'lang', id, text: v })
        setDraft(LANG_SET.has(v) ? null : v)
      }}
      onBlur={() => setDraft(null)}
    />
  )
}

export const CellView = memo(function CellView({ cell, focused }: { cell: Cell; focused: boolean }) {
  const dispatch = useDispatch()
  const id = cell.id
  return (
    <div
      className={`cell ${cell.kind}${focused ? ' focused' : ''}`}
      data-id={id}
      onFocus={() => focused || dispatch({ a: 'focus', id })}
    >
      <div className="titlebar">
        <input
          className="title"
          spellCheck={false}
          value={cell.title}
          onChange={(e) => dispatch({ a: 'title', id, text: e.target.value })}
        />
        {cell.kind === 'code' && <LangInput id={id} lang={cell.lang} />}
        <button className="more" onClick={() => window.api.popupCellMenu(id)}>
          ⋯
        </button>
      </div>
      {cell.kind === 'code' ? <CodeBody cell={cell} /> : <MdBody cell={cell} />}
    </div>
  )
})
