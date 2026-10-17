import { contextBridge, ipcRenderer } from 'electron'
import { CH, type Api, type Command } from '../shared/ipc'

const api: Api = {
  init: () => ipcRenderer.invoke(CH.init),
  docChanged: (json) => ipcRenderer.send(CH.docChanged, json),
  popupCellMenu: (id) => ipcRenderer.send(CH.popupCellMenu, id),
  setSettings: (s) => ipcRenderer.send(CH.setSettings, s),
  flushed: (n) => ipcRenderer.send(CH.flushed, n),
  onCommand: (fn) => ipcRenderer.on(CH.command, (_e, c: Command) => fn(c))
}

contextBridge.exposeInMainWorld('api', api)
