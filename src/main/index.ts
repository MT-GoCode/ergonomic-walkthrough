import { resolve } from 'path'
import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import { CH, type CellMenuOp, type Command } from '../shared/ipc'
import { settingsItem } from './settings'
import { fileMenu, newWindow, openInitial, openPaths } from './windows'

if (process.env.WT_USER_DATA) app.setPath('userData', process.env.WT_USER_DATA)

// One instance per userData: two would both rewrite session.json. A second launch hands its
// files to the first and exits without running quit handlers (which would save a session).
const primary = app.requestSingleInstanceLock()
if (!primary) app.exit(0)
app.on('second-instance', (_e, argv, cwd) =>
  openPaths(argv.filter((a) => a.endsWith('.walkthrough')).map((a) => resolve(cwd, a)))
)

// Links in rendered markdown open in the browser; the app window never navigates away.
app.on('web-contents-created', (_e, wc) => {
  const external = (url: string) => {
    if (['http:', 'https:', 'mailto:'].includes(new URL(url).protocol)) shell.openExternal(url)
  }
  wc.on('will-navigate', (e, url) => {
    e.preventDefault()
    external(url)
  })
  wc.setWindowOpenHandler(({ url }) => {
    external(url)
    return { action: 'deny' }
  })
})

const cellMenu: [CellMenuOp, string][] = [
  ['remove', 'Delete'],
  ['removeIndented', 'Delete with indented below']
]

// The losing instance must not open windows (and so write a session) before it exits.
if (primary)
  app.whenReady().then(() => {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            settingsItem,
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' }
          ]
        },
        ...fileMenu(),
        { role: 'editMenu' },
        { role: 'viewMenu' },
        { role: 'windowMenu' }
      ])
    )
    ipcMain.on(CH.popupCellMenu, (e, id: string) =>
      Menu.buildFromTemplate(
        cellMenu.map(([op, label]) => ({
          id: op,
          label,
          click: () => e.sender.send(CH.command, { t: 'cellMenu', id, op } satisfies Command)
        }))
      ).popup({ window: BrowserWindow.fromWebContents(e.sender)! })
    )
    openInitial(process.argv.filter((a) => a.endsWith('.walkthrough')))
    app.on('activate', () => BrowserWindow.getAllWindows().length || newWindow())
  })

// macOS: the app outlives its windows.
app.on('window-all-closed', () => {})
