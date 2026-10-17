import type { Dispatch, KeyboardEvent } from 'react'
import { EditorView } from '@uiw/react-codemirror'
import type { Action } from './state'

// Visual order is the DOM order of rendered cells (collapsed ones are not rendered).
const cellsInOrder = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.cell')]

export const cellOf = (node: Element): HTMLElement => node.closest<HTMLElement>('.cell')!

export function neighbor(cell: HTMLElement, dir: 1 | -1): HTMLElement | undefined {
  const all = cellsInOrder()
  return all[all.indexOf(cell) + dir]
}

export const focusTitle = (cell: HTMLElement): void =>
  cell.querySelector<HTMLInputElement>('.title')!.focus()

const isMd = (cell: HTMLElement): boolean => cell.classList.contains('md')

export function focusBody(
  cell: HTMLElement,
  at: 'start' | 'end',
  dispatch: Dispatch<Action>
): void {
  if (isMd(cell)) return dispatch({ a: 'edit', id: cell.dataset.id! })
  const view = EditorView.findFromDOM(cell.querySelector<HTMLElement>('.cm-editor')!)!
  view.focus()
  view.dispatch({ selection: { anchor: at === 'end' ? view.state.doc.length : 0 } })
}

// Arrows land on markdown titles, never in raw mode; Enter is the only way into a markdown body.
export function titleKey(e: KeyboardEvent<HTMLInputElement>, dispatch: Dispatch<Action>): void {
  const cell = cellOf(e.currentTarget)
  const id = cell.dataset.id!
  const prev = neighbor(cell, -1)
  const next = neighbor(cell, 1)
  if (e.key === 'Tab') dispatch({ a: e.shiftKey ? 'outdent' : 'indent', id })
  else if (e.key === 'Enter') focusBody(cell, 'start', dispatch)
  else if (e.key === 'ArrowUp' && prev)
    isMd(prev) ? focusTitle(prev) : focusBody(prev, 'end', dispatch)
  else if (e.key === 'ArrowDown')
    isMd(cell) ? next && focusTitle(next) : focusBody(cell, 'start', dispatch)
  else return
  e.preventDefault()
}

// From a body's first/last visual line: up goes to its own title, down to the next cell's title.
export const bodyEdge = (view: EditorView, dir: 1 | -1): boolean => {
  const cell = cellOf(view.dom)
  const target = dir === -1 ? cell : neighbor(cell, 1)
  if (target) focusTitle(target)
  return true
}
