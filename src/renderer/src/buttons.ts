import type { Kind } from '../../shared/doc'
import type { Mode } from '../../shared/ops'

// The insert buttons, shared by the strip under each cell and the ⌘-hover split line.
export const BUTTONS: [Mode, Kind, string][] = [
  ['same', 'code', '+ Code'],
  ['same', 'md', '+ MD'],
  ['in', 'code', '+ Code ⇥'],
  ['in', 'md', '+ MD ⇥'],
  ['out', 'code', '+ Code ⇤'],
  ['out', 'md', '+ MD ⇤']
]
