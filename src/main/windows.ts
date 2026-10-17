import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type MenuItemConstructorOptions,
  type Rectangle
} from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { basename, dirname, join, resolve } from 'path'
import { newDoc, parseDoc, serializeDoc } from '../shared/doc'
import { CH } from '../shared/ipc'
import { DEFAULT_SETTINGS } from '../shared/settings'
import { Autosave, autosaveDir } from './autosave'
import { readSession, writeSession, type Entry } from './session'

// Main is the single owner of window state. `file.saved` is the text on disk, or null when
// the file is gone, which leaves the window dirty until it is saved again.
type W = {
  win: BrowserWindow
  uuid: string
  json: string
  autosave: Autosave | null
  file: { path: string; saved: string | null } | null
}
type Paths = Omit<Entry, 'bounds'>

const wins = new Map<number, W>()
const closed: Entry[] = []
const early: string[] = []
let quitting = false

const filters = [{ name: 'Walkthrough', extensions: ['walkthrough'] }]
const dirty = (w: W): boolean => w.file !== null && w.json !== w.file.saved
const read = (p: string | null): string | null =>
  p && existsSync(p) ? readFileSync(p, 'utf8') : null
const ofWin = (win: { id: number }): W => wins.get(win.id)!
const entry = (w: W): Entry => ({
  autosavePath: w.autosave?.path ?? null,
  filePath: w.file?.path ?? null,
  bounds: w.win.getBounds()
})
const saveSession = (): void => writeSession([...wins.values()].map(entry))

function present(w: W): void {
  w.win.setTitle(w.file ? basename(w.file.path) : 'Untitled')
  w.win.setRepresentedFilename(w.file?.path ?? '')
  w.win.setDocumentEdited(dirty(w))
}

function guarded(label: string, fn: () => void): void {
  try {
    fn()
  } catch (err) {
    dialog.showErrorBox(label, (err as Error).message)
  }
}

ipcMain.handle(CH.init, (e) => JSON.parse(ofWin(BrowserWindow.fromWebContents(e.sender)!).json))
ipcMain.on(CH.docChanged, (e, json: string) => {
  const w = ofWin(BrowserWindow.fromWebContents(e.sender)!)
  w.json = json
  if (!w.autosave) {
    w.autosave = Autosave.create(w.uuid)
    saveSession()
  }
  w.autosave.push(json)
  w.win.setDocumentEdited(dirty(w))
})

function createWindow(state: Omit<W, 'win' | 'uuid'>, bounds?: Rectangle): void {
  // 800px fits 88ch + 4 indent levels of Menlo 12 (7.22px/ch) plus the window frame.
  const win = new BrowserWindow({
    width: 800,
    height: 900,
    ...bounds,
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
  const w: W = { win, uuid: crypto.randomUUID(), ...state }
  wins.set(win.id, w)
  present(w)
  if (w.file) app.addRecentDocument(w.file.path)
  win.on('page-title-updated', (e) => e.preventDefault())
  win.on('close', (e) => {
    if (quitting) return
    if (dirty(w)) {
      const choice = dialog.showMessageBoxSync(win, {
        type: 'warning',
        message: `Save changes to ${basename(w.file!.path)}?`,
        buttons: ['Save', "Don't Save", 'Cancel'],
        defaultId: 0,
        cancelId: 2
      })
      if (choice === 2) return e.preventDefault()
      if (choice === 0) save(w)
      else w.autosave = null
    }
    const p = w.file?.path ?? w.autosave?.path
    if (!p) return
    app.addRecentDocument(p)
    closed.push(entry(w))
  })
  win.on('closed', () => {
    wins.delete(win.id)
    if (!quitting) saveSession()
  })
  win.once('ready-to-show', () => (process.env.WT_SHOW_INACTIVE ? win.showInactive() : win.show()))
  const url = process.env.ELECTRON_RENDERER_URL
  if (url) win.loadURL(url)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  saveSession()
}

// Content is the autosave when one exists, otherwise the file; dirty is their difference.
function openEntry({ autosavePath, filePath }: Paths, bounds?: Rectangle): void {
  guarded(`Cannot open ${filePath ?? autosavePath ?? 'window'}`, () => {
    const auto = read(autosavePath)
    const saved = read(filePath)
    const json =
      auto ??
      saved ??
      ((autosavePath ?? filePath) ? null : serializeDoc(newDoc(DEFAULT_SETTINGS.defaultLang).cells))
    if (json === null)
      throw new Error(`Neither the file nor its autosave exists: ${filePath ?? autosavePath}`)
    parseDoc(json)
    createWindow(
      {
        json,
        autosave: auto === null ? null : new Autosave(autosavePath!),
        file: filePath ? { path: filePath, saved } : null
      },
      bounds
    )
  })
}

function openPath(path: string): void {
  const p = resolve(path)
  const open = [...wins.values()].find((w) => w.file?.path === p || w.autosave?.path === p)
  if (open) return open.win.focus()
  const adopted = dirname(p) === resolve(autosaveDir())
  openEntry({ autosavePath: adopted ? p : null, filePath: adopted ? null : p })
}

function save(w: W): void {
  if (!w.file) return void saveAs(w)
  writeFileSync(w.file.path, w.json)
  w.file.saved = w.json
  present(w)
}

async function saveAs(w: W): Promise<void> {
  const r = await dialog.showSaveDialog(w.win, {
    defaultPath: w.file?.path ?? 'Untitled.walkthrough',
    filters
  })
  if (r.canceled) return
  writeFileSync(r.filePath, w.json)
  w.file = { path: r.filePath, saved: w.json }
  present(w)
  app.addRecentDocument(r.filePath)
  saveSession()
}

// Hot exit: quitting never prompts; it waits for in-flight autosaves, then records the session.
app.on('before-quit', (e) => {
  if (quitting) return
  e.preventDefault()
  Promise.all([...wins.values()].map((w) => w.autosave?.flush())).then(() => {
    saveSession()
    quitting = true
    app.quit()
  })
})

// Registered at import, before ready, so a Finder launch's file is not lost.
app.on('open-file', (e, p) => {
  e.preventDefault()
  if (app.isReady()) openPath(p)
  else early.push(p)
})

export function openInitial(paths: string[]): void {
  guarded('Cannot restore the previous session', () =>
    readSession().forEach((s) => openEntry(s, s.bounds))
  )
  ;[...paths, ...early.splice(0)].forEach(openPath)
  if (!wins.size) openEntry({ autosavePath: null, filePath: null })
}

const onWin = (fn: (w: W) => unknown) => (_: unknown, win: { id: number } | undefined) =>
  win && fn(ofWin(win))

export const fileMenu = (): MenuItemConstructorOptions[] => [
  {
    label: 'File',
    submenu: [
      {
        id: 'newWindow',
        label: 'New Window',
        accelerator: 'CmdOrCtrl+N',
        click: () => openEntry({ autosavePath: null, filePath: null })
      },
      {
        id: 'open',
        label: 'Open…',
        accelerator: 'CmdOrCtrl+O',
        click: async () =>
          (
            await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters })
          ).filePaths.forEach(openPath)
      },
      {
        label: 'Open Recent',
        role: 'recentDocuments',
        submenu: [{ role: 'clearRecentDocuments' }]
      },
      {
        id: 'reopenClosed',
        label: 'Reopen Closed Window',
        accelerator: 'CmdOrCtrl+Shift+T',
        click: () => {
          const e = closed.pop()
          if (e) openEntry(e, e.bounds)
        }
      },
      { type: 'separator' },
      { id: 'save', label: 'Save', accelerator: 'CmdOrCtrl+S', click: onWin(save) },
      { id: 'saveAs', label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: onWin(saveAs) },
      { type: 'separator' },
      {
        id: 'revealAutosaves',
        label: 'Reveal Autosaves in Finder',
        click: () => {
          mkdirSync(autosaveDir(), { recursive: true })
          shell.openPath(autosaveDir())
        }
      }
    ]
  }
]
