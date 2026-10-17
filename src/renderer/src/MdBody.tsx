import { useCallback, useMemo, useState } from 'react'
import CodeMirror, { EditorView, keymap } from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Cell } from '../../shared/doc'
import { mdTheme, setup } from './editor'
import { useDispatch } from './state'

export function MdBody({ cell }: { cell: Extract<Cell, { kind: 'md' }> }): React.JSX.Element {
  const dispatch = useDispatch()
  const [editing, setEditing] = useState(false)
  const onChange = useCallback(
    (text: string) => dispatch({ a: 'body', id: cell.id, text }),
    [dispatch, cell.id]
  )
  const extensions = useMemo(
    () => [
      EditorView.lineWrapping,
      markdown({ codeLanguages: languages }),
      keymap.of([{ key: 'Escape', run: () => (setEditing(false), true) }])
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
          onBlur={(e) => e.currentTarget.contains(e.relatedTarget) || setEditing(false)}
        />
      ) : (
        <div className="rendered" onDoubleClick={() => setEditing(true)}>
          <Markdown remarkPlugins={[remarkGfm]}>{cell.body}</Markdown>
        </div>
      )}
    </div>
  )
}
