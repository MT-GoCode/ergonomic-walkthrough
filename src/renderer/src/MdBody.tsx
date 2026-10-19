import { useCallback, useMemo } from 'react'
import CodeMirror, { EditorView, keymap } from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { Prec } from '@codemirror/state'
import { languages } from '@codemirror/language-data'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Cell } from '../../shared/doc'
import { mdTheme, setup } from './editor'
import { Fenced } from './Fenced'
import { cellOf, focusTitle } from './focus'
import { crossCellArrows } from './nav'
import { dispatch } from './state'

export function MdBody({
  cell,
  editing
}: {
  cell: Extract<Cell, { kind: 'md' }>
  editing: boolean
}) {
  const id = cell.id
  const onChange = useCallback((text: string) => dispatch({ a: 'body', id, text }), [id])
  const extensions = useMemo(
    () => [
      EditorView.lineWrapping,
      markdown({ codeLanguages: languages }),
      crossCellArrows,
      // ⌘↩ / ⇧↩ render and leave the cursor on this cell's title (Jupyter-style).
      // High precedence: CodeMirror's default keymap binds Enter (with shift) and Mod-Enter.
      Prec.high(
        keymap.of(
          ['Mod-Enter', 'Shift-Enter'].map((key) => ({
            key,
            run: (v: EditorView) => {
              focusTitle(cellOf(v.dom))
              dispatch({ a: 'edit', id: null })
              return true
            }
          }))
        )
      )
    ],
    []
  )
  // Raw and rendered share one box so toggling never changes the layout height.
  const style = cell.height === 'fit' ? undefined : { height: `calc(var(--lh) * ${cell.height})` }
  return (
    <div className="body mdbox" style={style}>
      {editing ? (
        <CodeMirror
          autoFocus
          value={cell.body}
          theme={mdTheme}
          basicSetup={setup}
          extensions={extensions}
          onChange={onChange}
        />
      ) : (
        // Focusable so a single click selects the cell (and text) without entering raw mode.
        <div
          className="rendered"
          tabIndex={-1}
          onDoubleClick={() => dispatch({ a: 'edit', id })}
          onKeyDown={(e) => e.key === 'Enter' && dispatch({ a: 'edit', id })}
        >
          <Markdown remarkPlugins={[remarkGfm]} components={{ pre: Fenced }}>
            {cell.body}
          </Markdown>
        </div>
      )}
    </div>
  )
}
