import { useEffect, useReducer } from 'react'
import type { LanguageDescription, LanguageSupport } from '@codemirror/language'
import { vscodeDarkInit } from '@uiw/codemirror-theme-vscode'
import { EditorView, type BasicSetupOptions } from '@uiw/react-codemirror'

// Scoped theme beats CodeMirror's base theme, so the text column is exactly cols × 1ch.
const metrics = EditorView.theme({
  '.cm-content': { padding: '0' },
  '.cm-line': { padding: '0 4px' },
  '.cm-scroller': { lineHeight: 'var(--lh)' },
  '&.cm-focused': { outline: 'none' }
})
const dark = (background: string) => [
  vscodeDarkInit({
    settings: { background, gutterBackground: background, fontFamily: 'var(--font)' }
  }),
  metrics
]
export const codeTheme = dark('#000000')
export const mdTheme = dark('#1f1f1f')

// Plaintext editors that only highlight: no gutters, completion, bracket pairing or active line.
export const setup: BasicSetupOptions = {
  lineNumbers: false,
  foldGutter: false,
  highlightActiveLineGutter: false,
  highlightActiveLine: false,
  autocompletion: false,
  closeBrackets: false
}

// CodeMirror caches a loaded language on desc.support; re-render once it lands.
export function useLanguage(desc: LanguageDescription): LanguageSupport | undefined {
  const [, loaded] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (!desc.support) desc.load().then(loaded)
  }, [desc])
  return desc.support
}
