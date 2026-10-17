import { useEffect, useReducer } from 'react'
import { serializeDoc } from '../../shared/doc'
import type { Command } from '../../shared/ipc'
import { DEFAULT_SETTINGS as S } from '../../shared/settings'
import { Canvas } from './Canvas'
import { DispatchCtx, reducer } from './state'

export function App(): React.JSX.Element {
  const [s, dispatch] = useReducer(reducer, { cells: [], focusId: null, rev: 0 })

  useEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--font', S.fontFamily)
    root.setProperty('--fs', `${S.fontSize}px`)
    root.setProperty('--cols', String(S.cols))
    window.api.init().then((doc) => dispatch({ a: 'init', cells: doc.cells }))
    window.api.onCommand((c: Command) => {
      switch (c.t) {
        case 'cellMenu':
          return dispatch({ a: c.op, id: c.id })
        default:
          return c.t satisfies never
      }
    })
  }, [])

  // rev counts user edits only, so loading a doc never pushes. At most one push per frame.
  useEffect(() => {
    if (!s.rev) return
    const frame = requestAnimationFrame(() => window.api.docChanged(serializeDoc(s.cells)))
    return () => cancelAnimationFrame(frame)
  }, [s.rev, s.cells])

  return (
    <DispatchCtx.Provider value={dispatch}>
      <Canvas cells={s.cells} focusId={s.focusId} />
    </DispatchCtx.Provider>
  )
}
