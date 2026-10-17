import type { Doc } from './doc'
import type { Settings } from './settings'

export const CH = {
  init: 'wt:init',
  docChanged: 'wt:docChanged',
  popupCellMenu: 'wt:popupCellMenu',
  setSettings: 'wt:setSettings',
  flushed: 'wt:flushed',
  command: 'wt:command'
} as const

export type CellMenuOp = 'remove' | 'removeIndented'

// main → renderer
export type Command =
  | { t: 'cellMenu'; id: string; op: CellMenuOp }
  | { t: 'settings'; s: Settings }
  | { t: 'openSettings' }
  | { t: 'flush'; n: number }

// renderer → main; the only surface the renderer sees.
export interface Api {
  init(): Promise<{ doc: Doc; settings: Settings }>
  docChanged(json: string): void
  popupCellMenu(id: string): void
  setSettings(s: Settings): void
  flushed(n: number): void
  onCommand(fn: (c: Command) => void): void
}
