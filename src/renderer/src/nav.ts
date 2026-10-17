import { Prec } from '@codemirror/state'
import { cursorLineDown, cursorLineUp } from '@codemirror/commands'
import { keymap } from '@uiw/react-codemirror'
import { bodyEdge } from './focus'

// Arrows cross cell boundaries only once the cursor is on the first/last visual line.
export const crossCellArrows = Prec.high(
  keymap.of([
    { key: 'ArrowUp', run: (v) => cursorLineUp(v) || bodyEdge(v, -1) },
    { key: 'ArrowDown', run: (v) => cursorLineDown(v) || bodyEdge(v, 1) }
  ])
)
