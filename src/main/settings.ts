import { app, BrowserWindow, dialog, ipcMain, type MenuItemConstructorOptions } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { CH, type Command } from '../shared/ipc'
import { atomicWrite } from './atomic'
import { DEFAULT_SETTINGS, Settings } from '../shared/settings'

// Main is the only writer of settings.json; every window receives each change as a Command.
let cached: Settings | null = null
const file = (): string => join(app.getPath('userData'), 'settings.json')

export function current(): Settings {
  if (cached) return cached
  const p = file()
  if (!existsSync(p)) return (cached = DEFAULT_SETTINGS)
  try {
    cached = Settings.parse(JSON.parse(readFileSync(p, 'utf8')))
  } catch (err) {
    // Loud, and the bad file stays untouched until the user changes a setting.
    dialog.showErrorBox(`Ignoring invalid settings: ${p}`, String(err))
    cached = DEFAULT_SETTINGS
  }
  return cached
}

ipcMain.on(CH.setSettings, (_e, next: unknown) => {
  const s = Settings.parse(next)
  atomicWrite(file(), JSON.stringify(s, null, 2) + '\n')
  cached = s
  for (const w of BrowserWindow.getAllWindows())
    w.webContents.send(CH.command, { t: 'settings', s } satisfies Command)
})

export const settingsItem: MenuItemConstructorOptions = {
  id: 'settings',
  label: 'Settings…',
  accelerator: 'CmdOrCtrl+,',
  click: (_item, win) =>
    (win as BrowserWindow | undefined)?.webContents.send(CH.command, {
      t: 'openSettings'
    } satisfies Command)
}
