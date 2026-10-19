import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { wrappedLineIndent } from 'codemirror-wrapped-line-indent'
import { languages } from '@codemirror/language-data'
import type { Cell } from '../../shared/doc'
import { dedent } from '../../shared/ops'
import { BUTTONS } from './buttons'
import { codeTheme, setup, useLanguage } from './editor'
import { crossCellArrows } from './nav'
import { dispatch } from './state'

const pasteDedented = EditorView.clipboardInputFilter.of(dedent)

export function CodeBody({ cell }: { cell: Extract<Cell, { kind: 'code' }> }) {
  const support = useLanguage(languages.find((l) => l.name === cell.lang)!)
  const onChange = useCallback(
    (text: string) => dispatch({ a: 'body', id: cell.id, text }),
    [cell.id]
  )
  const extensions = useMemo(
    () => [
      EditorView.lineWrapping,
      wrappedLineIndent,
      crossCellArrows,
      pasteDedented,
      ...(support ? [support] : [])
    ],
    [support]
  )
  const [cut, setCut] = useState<{ at: number; y: number } | null>(null)
  // Releasing ⌘ without moving the mouse still hides the split line.
  useEffect(() => {
    if (!cut) return
    const up = (e: KeyboardEvent) => e.key === 'Meta' && setCut(null)
    window.addEventListener('keyup', up)
    return () => window.removeEventListener('keyup', up)
  }, [cut])
  return (
    <>
      <CodeMirror
        className="body"
        onMouseMove={(e) => setCut(e.metaKey ? cutAt(e) : null)}
        onMouseLeave={(e) =>
          e.relatedTarget instanceof Element && e.relatedTarget.closest('.cutline')
            ? undefined
            : setCut(null)
        }
        value={cell.body}
        theme={codeTheme}
        basicSetup={setup}
        extensions={extensions}
        onChange={onChange}
      />
      {cut && (
        <div className="cutline" style={{ top: cut.y }}>
          <div className="btns">
            {BUTTONS.filter(([mode]) => mode !== 'out').map(([mode, kind, label]) => (
              <button
                key={mode + kind}
                tabIndex={-1}
                onClick={() =>
                  dispatch({
                    a: 'split',
                    id: cell.id,
                    at: cut.at,
                    mode: mode as 'same' | 'in',
                    kind
                  })
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

// With ⌘ held, the boundary between the two code lines nearest the pointer (never before the
// first or after the last line, which the cell's own insert strip covers), and its y offset
// within the cell, which positions the line (no wrapper element per editor).
function cutAt(e: MouseEvent<HTMLDivElement>): { at: number; y: number } | null {
  const view = EditorView.findFromDOM(e.currentTarget.querySelector<HTMLElement>('.cm-editor')!)!
  const { doc } = view.state
  if (doc.lines < 2) return null
  const block = view.lineBlockAtHeight(e.clientY - view.documentTop)
  const line = doc.lineAt(block.from).number
  const lower = e.clientY - view.documentTop > (block.top + block.bottom) / 2
  const at = Math.min(Math.max(lower ? line : line - 1, 1), doc.lines - 1)
  const y = view.documentTop + view.lineBlockAt(doc.line(at).from).bottom
  return { at, y: y - e.currentTarget.closest('.cell')!.getBoundingClientRect().top }
}
