import { languages } from '@codemirror/language-data'

export const LANGS = languages.map((l) => l.name).sort((a, b) => a.localeCompare(b))
// Language names are matched case-insensitively wherever the user types one.
export const langNamed = (typed: string): string | undefined =>
  LANG_BY_LOWER.get(typed.toLowerCase())
const LANG_BY_LOWER = new Map(LANGS.map((n) => [n.toLowerCase(), n]))
