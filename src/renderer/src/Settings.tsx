import { useState } from 'react'
import { Settings } from '../../shared/settings'
import { langNamed } from './langs'

type Field = { key: keyof Settings; label: string; type: 'text' | 'number'; list?: string }
const FIELDS: Field[] = [
  { key: 'defaultLang', label: 'Default language', type: 'text', list: 'langs' },
  { key: 'fontFamily', label: 'Font', type: 'text' },
  { key: 'fontSize', label: 'Font size (px)', type: 'number' },
  { key: 'cols', label: 'Cell width (characters)', type: 'number' }
]

// Every keystroke applies live to all windows if the whole form is valid; an invalid
// field is marked and nothing is sent until it is fixed.
export function SettingsModal({ settings, close }: { settings: Settings; close: () => void }) {
  const [draft, setDraft] = useState<Record<keyof Settings, string>>(() => ({
    defaultLang: settings.defaultLang,
    fontFamily: settings.fontFamily,
    fontSize: String(settings.fontSize),
    cols: String(settings.cols)
  }))
  // Fields are text; the language matches case-insensitively, like the title-bar field.
  const parse = (d: typeof draft) =>
    Settings.safeParse({
      defaultLang: langNamed(d.defaultLang) ?? d.defaultLang,
      fontFamily: d.fontFamily,
      fontSize: Number(d.fontSize),
      cols: Number(d.cols)
    })
  const parsed = parse(draft)
  const bad = new Set(parsed.success ? [] : parsed.error.issues.map((i) => i.path[0]))
  const change = (key: keyof Settings, value: string) => {
    const next = { ...draft, [key]: value }
    setDraft(next)
    const ok = parse(next)
    if (ok.success) window.api.setSettings(ok.data)
  }
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="settings" onKeyDown={(e) => e.key === 'Escape' && close()}>
        <div className="settings-title">Settings</div>
        {FIELDS.map((f, i) => (
          <label key={f.key}>
            <span>{f.label}</span>
            <input
              name={f.key}
              autoFocus={i === 0}
              type={f.type}
              list={f.list}
              spellCheck={false}
              className={bad.has(f.key) ? 'invalid' : undefined}
              value={draft[f.key]}
              onChange={(e) => change(f.key, e.target.value)}
            />
          </label>
        ))}
      </div>
    </div>
  )
}
