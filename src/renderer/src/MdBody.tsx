import { useCallback, useMemo } from 'react'
import CodeMirror, { EditorView, keymap } from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Cell } from '../../shared/doc'
import { mdTheme, setup } from './editor'
import { cellOf, focusTitle } from './focus'
import { crossCellArrows } from './nav'
import { useDispatch } from './state'

export function MdBody({
  cell,
  editing
}: {
  cell: Extract<Cell, { kind: 'md' }>
  editing: boolean
}) {
  const dispatch = useDispatch()
  const id = cell.id
  const onChange = useCallback((text: string) => dispatch({ a: 'body', id, text }), [dispatch, id])
  const extensions = useMemo(
    () => [
      EditorView.lineWrapping,
      markdown({ codeLanguages: languages }),
      crossCellArrows,
      // Esc returns to the title; the blur that follows leaves raw mode.
      keymap.of([{ key: 'Escape', run: (v) => (focusTitle(cellOf(v.dom)), true) }])
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
          onBlur={(e) =>
            e.currentTarget.contains(e.relatedTarget) || dispatch({ a: 'edit', id: null })
          }
        />
      ) : (
        // Focusable so a single click selects the cell (and text) without entering raw mode.
        <div
          className="rendered"
          tabIndex={-1}
          onDoubleClick={() => dispatch({ a: 'edit', id })}
          onKeyDown={(e) => e.key === 'Enter' && dispatch({ a: 'edit', id })}
        >
          <Markdown remarkPlugins={[remarkGfm]}>{cell.body}</Markdown>
        </div>
      )}
    </div>
  )
}
