import { BrowserWindow, dialog, ipcMain, type MenuItemConstructorOptions } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'
import { newDoc, parseDoc, type Doc } from '../shared/doc'
import { CH } from '../shared/ipc'
import { DEFAULT_SETTINGS } from '../shared/settings'

// Stub: the persistence sub-journey replaces this module wholesale.

const docs = new Map<number, Doc>()
ipcMain.handle(CH.init, (e) => docs.get(e.sender.id))
ipcMain.on(CH.docChanged, () => {})

function openWindow(doc: Doc): void {
  // 800px fits 88ch + 4 indent levels of Menlo 12 (7.22px/ch) plus the window frame.
  const win = new BrowserWindow({
    width: 800,
    height: 900,
    show: false,
    backgroundColor: '#000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      spellcheck: false,
      // Inactive or covered windows must keep painting (measured: 0 fps otherwise).
      backgroundThrottling: false
    }
  })
  docs.set(win.webContents.id, doc)
  win.once('ready-to-show', () => (process.env.WT_SHOW_INACTIVE ? win.showInactive() : win.show()))
  const url = process.env.ELECTRON_RENDERER_URL
  if (url) win.loadURL(url)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

export function openInitial(paths: string[]): void {
  if (!paths.length) return openWindow(newDoc(DEFAULT_SETTINGS.defaultLang))
  for (const p of paths) {
    try {
      openWindow(parseDoc(readFileSync(p, 'utf8')))
    } catch (err) {
      dialog.showErrorBox(`Cannot open ${p}`, String(err))
    }
  }
}

export const fileMenu = (): MenuItemConstructorOptions[] => []
