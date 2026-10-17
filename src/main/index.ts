import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import { CH, type CellMenuOp, type Command } from '../shared/ipc'
import { fileMenu, openInitial } from './windows'

if (process.env.WT_USER_DATA) app.setPath('userData', process.env.WT_USER_DATA)

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

app.whenReady().then(() => {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
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
  app.on('activate', () => BrowserWindow.getAllWindows().length || openInitial([]))
})

// macOS: the app outlives its windows.
app.on('window-all-closed', () => {})
