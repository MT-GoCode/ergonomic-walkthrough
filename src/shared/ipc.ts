import type { Doc } from './doc'

export const CH = {
  init: 'wt:init',
  docChanged: 'wt:docChanged',
  popupCellMenu: 'wt:popupCellMenu',
  command: 'wt:command'
} as const

export type CellMenuOp = 'delete' | 'deleteIndented'

// main → renderer
export type Command = { t: 'cellMenu'; id: string; op: CellMenuOp }

// renderer → main; the only surface the renderer sees.
export interface Api {
  init(): Promise<Doc>
  docChanged(json: string): void
  popupCellMenu(id: string): void
  onCommand(fn: (c: Command) => void): void
}
