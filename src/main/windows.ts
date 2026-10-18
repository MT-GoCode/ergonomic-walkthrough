import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  screen,
  shell,
  type MenuItemConstructorOptions,
  type Rectangle
} from 'electron'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { basename, dirname, join, resolve } from 'path'
import { newCell, parseDoc, serializeDoc } from '../shared/doc'
import { CH, type Command } from '../shared/ipc'
import { atomicWrite } from './atomic'
import { Autosave, autosaveDir } from './autosave'
import { current } from './settings'
import { readSession, writeSession, type Entry } from './session'

// Main is the single owner of window state. `file.saved` is the text on disk, or null when
// the file is gone, which leaves the window dirty until it is saved again. `live` is true
// once the page has asked for its doc: only then can it hold edits or answer a flush.
// `closing` is true while a close is being decided, so a second ⌘W cannot start another.
type W = {
  win: BrowserWindow
  live: boolean
  closing: boolean
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
// Undefined for windows that are not documents (DevTools) or are already gone.
const ofWin = (win: { id: number } | null | undefined): W | undefined =>
  win ? wins.get(win.id) : undefined
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

// Returns whether fn succeeded; a failure is always shown, never swallowed.
async function guarded(label: string, fn: () => unknown): Promise<boolean> {
  try {
    await fn()
    return true
  } catch (err) {
    dialog.showErrorBox(label, (err as Error).message)
    return false
  }
}

// The renderer pushes each edit as it is applied and answers a flush after them (IPC is
// FIFO), so once this resolves `w.json` holds every edit the user has made.
const flushes = new Map<number, { wc: number; done: () => void }>()
let flushSeq = 0
function flush(w: W): Promise<void> {
  const wc = w.win.webContents
  if (!w.live || wc.isDestroyed() || wc.isCrashed()) return Promise.resolve()
  return new Promise((done) => {
    const n = ++flushSeq
    flushes.set(n, { wc: wc.id, done })
    wc.send(CH.command, { t: 'flush', n } satisfies Command)
  })
}
ipcMain.on(CH.flushed, (_e, n: number) => {
  flushes.get(n)!.done()
  flushes.delete(n)
})

ipcMain.handle(CH.init, (e) => {
  const w = ofWin(BrowserWindow.fromWebContents(e.sender))!
  w.live = true
  return { doc: JSON.parse(w.json), settings: current() }
})
ipcMain.on(CH.docChanged, (e, json: string) => {
  const w = ofWin(BrowserWindow.fromWebContents(e.sender))!
  w.json = json
  if (!w.autosave) {
    w.autosave = Autosave.create()
    saveSession()
  }
  w.autosave.push(json)
  w.win.setDocumentEdited(dirty(w))
})

// Saved bounds are kept only if they still touch a display (a monitor may be gone).
const onScreen = (b: Rectangle): boolean =>
  screen
    .getAllDisplays()
    .some(
      ({ workArea: a }) =>
        b.x < a.x + a.width && a.x < b.x + b.width && b.y < a.y + a.height && a.y < b.y + b.height
    )

function createWindow(state: Omit<W, 'win' | 'live' | 'closing'>, bounds?: Rectangle): void {
  // 800px fits 88ch + 4 indent levels of Menlo 12 (7.22px/ch) plus the window frame.
  const win = new BrowserWindow({
    width: 800,
    height: 900,
    ...(bounds && onScreen(bounds) ? bounds : {}),
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
  const w: W = { win, live: false, closing: false, ...state }
  wins.set(win.id, w)
  present(w)
  if (w.file) app.addRecentDocument(w.file.path)
  win.on('page-title-updated', (e) => e.preventDefault())
  // A page that reloads or dies holds no edits beyond what it pushed: release its flushes.
  const abandon = () =>
    flushes.forEach((f, n) => f.wc === win.webContents.id && (f.done(), flushes.delete(n)))
  win.webContents.on('did-start-loading', () => ((w.live = false), abandon()))
  win.webContents.on('render-process-gone', abandon)
  win.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    if (w.closing) return
    w.closing = true
    void guarded(`Cannot close ${w.file ? basename(w.file.path) : 'Untitled'}`, async () => {
      await flush(w)
      if (dirty(w)) {
        const choice = dialog.showMessageBoxSync(win, {
          type: 'warning',
          message: `Save changes to ${basename(w.file!.path)}?`,
          buttons: ['Save', "Don't Save", 'Cancel'],
          defaultId: 0,
          cancelId: 2
        })
        if (choice === 2) return
        if (choice === 0 && !(await save(w))) return
        if (choice === 1) await dropAutosave(w)
      }
      const p = w.file?.path ?? w.autosave?.path
      if (p) {
        app.addRecentDocument(p)
        closed.push(entry(w))
      }
      win.destroy()
    }).then(() => (w.closing = false)) // a cancelled or failed close can be retried
  })
  win.on('closed', () => {
    wins.delete(win.id)
    if (!quitting) saveSession()
  })
  win.once('ready-to-show', () => {
    if (!process.env.WT_INVISIBLE) return win.show()
    // Test runs: on screen for Chromium (so it renders and measures as usual), but
    // transparent, click-through and unfocused for whoever is using the machine.
    win.setOpacity(0)
    win.setIgnoreMouseEvents(true)
    win.showInactive()
  })
  const url = process.env.ELECTRON_RENDERER_URL
  if (url) win.loadURL(url)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  saveSession()
}

// Content is the autosave when one exists, otherwise the file; dirty is their difference.
function openEntry({ autosavePath, filePath }: Paths, bounds?: Rectangle): void {
  // A document already open in a window is focused there, never opened twice.
  const open = [...wins.values()].find(
    (w) =>
      (filePath && w.file?.path === filePath) || (autosavePath && w.autosave?.path === autosavePath)
  )
  if (open) return open.win.focus()
  void guarded(`Cannot open ${filePath ?? autosavePath ?? 'window'}`, () => {
    const auto = read(autosavePath)
    const saved = read(filePath)
    const json =
      auto ??
      saved ??
      ((autosavePath ?? filePath)
        ? null
        : serializeDoc([newCell('code', 0, current().defaultLang)]))
    if (json === null)
      throw new Error(`Neither the file nor its autosave exists: ${filePath ?? autosavePath}`)
    parseDoc(json)
    createWindow(
      {
        json,
        autosave: auto === null ? null : Autosave.at(autosavePath!),
        file: filePath ? { path: filePath, saved } : null
      },
      bounds
    )
  })
}

function openPath(path: string): void {
  const p = resolve(path)
  const adopted = dirname(p) === resolve(autosaveDir())
  openEntry({ autosavePath: adopted ? p : null, filePath: adopted ? null : p })
}

// Once a file holds the text, its autosave is redundant: drop it so a later relaunch reads
// the file (which may have changed on disk) rather than a stale copy.
// Detached before the delete, so an edit arriving meanwhile starts a fresh autosave.
async function dropAutosave(w: W): Promise<void> {
  const old = w.autosave
  w.autosave = null
  saveSession()
  await old?.discard()
}

// Both resolve to whether the document is now on disk; failures are shown, never silent.
async function save(w: W): Promise<boolean> {
  if (!w.file) return saveAs(w)
  const path = w.file.path
  await flush(w)
  const ok = await guarded(`Cannot save ${path}`, () => atomicWrite(path, w.json))
  if (!ok) return false
  w.file.saved = w.json
  present(w)
  await dropAutosave(w)
  return true
}

async function saveAs(w: W): Promise<boolean> {
  const r = await dialog.showSaveDialog(w.win, {
    defaultPath: w.file?.path ?? 'Untitled.walkthrough',
    filters
  })
  if (r.canceled) return false
  await flush(w)
  if (!(await guarded(`Cannot save ${r.filePath}`, () => atomicWrite(r.filePath, w.json))))
    return false
  w.file = { path: r.filePath, saved: w.json }
  present(w)
  app.addRecentDocument(r.filePath)
  await dropAutosave(w)
  return true
}

// Hot exit: quitting never prompts; it waits for in-flight autosaves, then records the session.
app.on('before-quit', (e) => {
  if (quitting) return
  e.preventDefault()
  void Promise.all([...wins.values()].map((w) => flush(w).then(() => w.autosave?.flush()))).then(
    () => {
      saveSession()
      quitting = true
      app.quit()
    }
  )
})

// Registered at import, before ready, so a Finder launch's file is not lost.
app.on('open-file', (e, p) => {
  e.preventDefault()
  if (app.isReady()) openPath(p)
  else early.push(p)
})

export const newWindow = (): void => openEntry({ autosavePath: null, filePath: null })

export const openPaths = (paths: string[]): void => paths.forEach(openPath)

export function openInitial(paths: string[]): void {
  void guarded('Cannot restore the previous session', () =>
    readSession().forEach((s) => openEntry(s, s.bounds))
  )
  ;[...paths, ...early.splice(0)].forEach(openPath)
  if (!wins.size) newWindow()
}

// Menu items act on the window they were invoked from, and only if it is a document.
const onWin = (fn: (w: W) => unknown) => (_: unknown, win: { id: number } | undefined) => {
  const w = ofWin(win)
  if (w) void fn(w)
}

export const fileMenu = (): MenuItemConstructorOptions[] => [
  {
    label: 'File',
    submenu: [
      {
        id: 'newWindow',
        label: 'New Window',
        accelerator: 'CmdOrCtrl+N',
        click: newWindow
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
