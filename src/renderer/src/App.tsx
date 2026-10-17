import { useEffect, useReducer, useRef } from 'react'
import { serializeDoc } from '../../shared/doc'
import type { Command } from '../../shared/ipc'
import { DEFAULT_SETTINGS as S } from '../../shared/settings'
import { Canvas } from './Canvas'
import { DispatchCtx, reducer } from './state'

export function App(): React.JSX.Element {
  const [s, dispatch] = useReducer(reducer, { cells: [], focusId: null, rev: 0 })
  const cells = useRef(s.cells)
  cells.current = s.cells
  const pending = useRef(false)

  useEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--font', S.fontFamily)
    root.setProperty('--fs', `${S.fontSize}px`)
    root.setProperty('--cols', String(S.cols))
    window.api.init().then((doc) => dispatch({ a: 'init', cells: doc.cells }))
    window.api.onCommand((c: Command) => {
      switch (c.t) {
        case 'cellMenu':
          return dispatch({ a: c.op === 'delete' ? 'remove' : 'removeIndented', id: c.id })
      }
    })
  }, [])

  // rev counts user edits only, so loading a doc never pushes. At most one push per frame.
  useEffect(() => {
    if (!s.rev || pending.current) return
    pending.current = true
    requestAnimationFrame(() => {
      pending.current = false
      window.api.docChanged(serializeDoc(cells.current))
    })
  }, [s.rev])

  return (
    <DispatchCtx.Provider value={dispatch}>
      <Canvas cells={s.cells} focusId={s.focusId} />
    </DispatchCtx.Provider>
  )
}
