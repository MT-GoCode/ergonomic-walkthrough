import { z } from 'zod'
import { languages } from '@codemirror/language-data'

export const LANG_NAMES = languages.map((l) => l.name) as [string, ...string[]]

export const Settings = z.strictObject({
  defaultLang: z.enum(LANG_NAMES),
  fontFamily: z.string().min(1),
  fontSize: z.int().min(1),
  cols: z.int().min(1)
})
export type Settings = z.infer<typeof Settings>

// VS Code's editor defaults (Menlo 12px); 88 columns is Minh's call (black's line length).
export const DEFAULT_SETTINGS: Settings = {
  defaultLang: 'Python',
  fontFamily: 'Menlo',
  fontSize: 12,
  cols: 88
}
