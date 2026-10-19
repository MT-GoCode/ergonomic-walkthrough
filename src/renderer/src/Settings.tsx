import { Fragment, useState } from 'react'
import { Settings } from '../../shared/settings'
import { SHORTCUTS } from '../../shared/shortcuts'
import { LANGS, langNamed } from './langs'

type Field = { key: keyof Settings; label: string; type: 'text' | 'number'; list?: string }
const FIELDS: Field[] = [
  { key: 'defaultLang', label: 'Default language', type: 'text', list: 'langs' },
  { key: 'fontFamily', label: 'Font', type: 'text' },
  { key: 'fontSize', label: 'Font size (px)', type: 'number' },
  { key: 'cols', label: 'Cell width (characters)', type: 'number' }
]

// Applies to all windows when committed and the whole form is valid; an invalid field is
// marked and nothing is sent until it is fixed.
export function SettingsModal({ settings, close }: { settings: Settings; close: () => void }) {
  const [draft, setDraft] = useState<Record<keyof Settings, string>>(() => ({
    defaultLang: settings.defaultLang,
    fontFamily: settings.fontFamily,
    fontSize: String(settings.fontSize),
    cols: String(settings.cols)
  }))
  // Fields are text; the language matches case-insensitively.
  const parse = (d: typeof draft) =>
    Settings.safeParse({
      defaultLang: langNamed(d.defaultLang) ?? d.defaultLang,
      fontFamily: d.fontFamily,
      fontSize: Number(d.fontSize),
      cols: Number(d.cols)
    })
  const parsed = parse(draft)
  const bad = new Set(parsed.success ? [] : parsed.error.issues.map((i) => i.path[0]))
  // Committed on Enter, blur or close, not per keystroke: retyping 88 → 100 must not lay
  // every window out at width 1 on the way.
  const commit = () =>
    parsed.success &&
    JSON.stringify(parsed.data) !== JSON.stringify(settings) &&
    window.api.setSettings(parsed.data)
  const done = () => (commit(), close())
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && done()}>
      <div
        className="settings"
        onKeyDown={(e) => (e.key === 'Escape' ? done() : e.key === 'Enter' && commit())}
      >
        <div className="settings-title">Settings</div>
        <datalist id="langs">
          {LANGS.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
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
              onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
              onBlur={commit}
            />
          </label>
        ))}
        <div className="settings-title">Keyboard shortcuts</div>
        <dl className="shortcuts">
          {SHORTCUTS.map(([keys, action]) => (
            <Fragment key={keys}>
              <dt>{keys}</dt>
              <dd>{action}</dd>
            </Fragment>
          ))}
        </dl>
      </div>
    </div>
  )
}
