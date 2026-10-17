import { useCallback, useMemo } from 'react'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { languages } from '@codemirror/language-data'
import type { Cell } from '../../shared/doc'
import { codeTheme, setup, useLanguage } from './editor'
import { useDispatch } from './state'

export function CodeBody({ cell }: { cell: Extract<Cell, { kind: 'code' }> }): React.JSX.Element {
  const dispatch = useDispatch()
  const support = useLanguage(languages.find((l) => l.name === cell.lang)!)
  const onChange = useCallback(
    (text: string) => dispatch({ a: 'body', id: cell.id, text }),
    [dispatch, cell.id]
  )
  const extensions = useMemo(
    () => [EditorView.lineWrapping, ...(support ? [support] : [])],
    [support]
  )
  return (
    <CodeMirror
      className="body"
      value={cell.body}
      theme={codeTheme}
      basicSetup={setup}
      extensions={extensions}
      onChange={onChange}
    />
  )
}
