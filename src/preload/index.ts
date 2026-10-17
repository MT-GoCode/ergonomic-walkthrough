import { contextBridge, ipcRenderer } from 'electron'
import { CH, type Api, type Command } from '../shared/ipc'

const api: Api = {
  init: () => ipcRenderer.invoke(CH.init),
  docChanged: (json) => ipcRenderer.send(CH.docChanged, json),
  popupCellMenu: (id) => ipcRenderer.send(CH.popupCellMenu, id),
  onCommand: (fn) => ipcRenderer.on(CH.command, (_e, c: Command) => fn(c))
}

contextBridge.exposeInMainWorld('api', api)
