import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Command } from '../../shared/ipc'
import type { Settings } from '../../shared/settings'
import { Canvas } from './Canvas'
import { SettingsModal } from './Settings'
import { dispatch, store } from './state'

export function App() {
  const s = useSyncExternalStore(store.subscribe, store.get)
  // The last settings main broadcast; main is their only writer.
  const [settings, setSettings] = useState<Settings | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    window.api.init().then(({ doc, settings }) => {
      setSettings(settings)
      dispatch({ a: 'init', cells: doc.cells, defaultLang: settings.defaultLang })
    })
    window.api.onCommand((c: Command) => {
      switch (c.t) {
        case 'cellMenu':
          return dispatch({ a: c.op, id: c.id })
        case 'settings':
          setSettings(c.s)
          return dispatch({ a: 'settings', defaultLang: c.s.defaultLang })
        case 'openSettings':
          return setSettingsOpen(true)
        case 'flush':
          // Edits are pushed as they are applied, but a keystroke sent just before the flush
          // may still be in Chromium's input pipeline, which IPC can overtake. Input that was
          // sent earlier is handled before the next frame, so answer after it.
          return requestAnimationFrame(() => setTimeout(() => window.api.flushed(c.n)))
        default:
          return c satisfies never
      }
    })
  }, [])

  useEffect(() => {
    if (!settings) return
    const root = document.documentElement.style
    root.setProperty('--font', settings.fontFamily)
    root.setProperty('--fs', `${settings.fontSize}px`)
    root.setProperty('--cols', String(settings.cols))
  }, [settings])

  if (!settings) return null
  return (
    <>
      <Canvas cells={s.cells} focusId={s.focusId} editingId={s.editingId} settings={settings} />
      {settingsOpen && <SettingsModal settings={settings} close={() => setSettingsOpen(false)} />}
    </>
  )
}
