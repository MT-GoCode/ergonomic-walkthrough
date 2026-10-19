import type { ReactNode } from 'react'
import type { Element, Text } from 'hast'
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { highlightCode } from '@lezer/highlight'
import { codeForeground, codeHighlight, useLanguage } from './editor'

// A fenced code block in rendered markdown, highlighted exactly like a code cell. The fence's
// info string (```python) names the language; an unknown or missing one stays plain.
export function Fenced({ node }: { node?: Element }) {
  const code = node!.children[0] as Element
  const lang = (code.properties.className as string[] | undefined)
    ?.find((c) => c.startsWith('language-'))
    ?.slice('language-'.length)
  const text = code.children
    .map((c) => (c as Text).value)
    .join('')
    .replace(/\n$/, '')
  const support = useLanguage(
    lang ? LanguageDescription.matchLanguageName(languages, lang, true) : null
  )
  const out: ReactNode[] = []
  if (support)
    highlightCode(
      text,
      support.language.parser.parse(text),
      codeHighlight,
      (t, cls) =>
        out.push(
          cls ? (
            <span key={out.length} className={cls}>
              {t}
            </span>
          ) : (
            t
          )
        ),
      () => out.push('\n')
    )
  return (
    <pre style={{ color: codeForeground }}>
      <code>{support ? out : text}</code>
    </pre>
  )
}
