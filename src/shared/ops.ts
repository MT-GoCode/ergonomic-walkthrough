import { produce } from 'immer'
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import type { Cell } from './doc'

// Pure edits on the flat preorder list. Every op keeps the Doc invariant
// (non-empty, cells[0].depth == 0, depth[i+1] <= depth[i] + 1) and none moves a
// surviving cell up or down on screen. An op that cannot apply returns its input.

type Cells = Cell[]

export const subtreeEnd = (cs: Cells, i: number): number => {
  let j = i + 1
  while (j < cs.length && cs[j].depth > cs[i].depth) j++
  return j
}

export function visible(cs: Cells): number[] {
  const out: number[] = []
  let hideBelow = Infinity
  cs.forEach((c, i) => {
    if (c.depth > hideBelow) return
    hideBelow = c.collapsed && subtreeEnd(cs, i) > i + 1 ? c.depth : Infinity
    out.push(i)
  })
  return out
}

export type Mode = 'same' | 'in' | 'out'
export type Slot = { index: number; depth: number }

// Where each insert button under cells[i] puts a new cell: directly below the
// strip, at a depth that never adopts the cells that follow. null = disabled.
export function insertModes(cs: Cells, i: number): Record<Mode, Slot | null> {
  const d = cs[i].depth
  const end = subtreeEnd(cs, i)
  const kids = end > i + 1
  if (kids && !cs[i].collapsed) return { same: { index: i + 1, depth: d + 1 }, in: null, out: null }
  const lastInGroup = d > 0 && (end === cs.length || cs[end].depth < d)
  return {
    same: { index: end, depth: d },
    in: { index: i + 1, depth: d + 1 },
    out: lastInGroup ? { index: end, depth: d - 1 } : null
  }
}

export const insert = (cs: Cells, i: number, slot: Slot, cell: Cell): Cells =>
  produce(cs, (draft) => {
    // A child must be visible where it was clicked into existence.
    if (slot.depth > draft[i].depth) draft[i].collapsed = false
    draft.splice(slot.index, 0, { ...cell, depth: slot.depth })
  })

const shift = (cs: Cells, i: number, by: number): Cells =>
  produce(cs, (draft) => {
    for (let j = i; j < subtreeEnd(cs, i); j++) draft[j].depth += by
  })

// Children are promoted one level so nothing vanishes with their parent.
export function remove(cs: Cells, i: number, blank: Cell): Cells {
  const end = subtreeEnd(cs, i)
  const out = produce(cs, (draft) => {
    for (let j = i + 1; j < end; j++) draft[j].depth--
    draft.splice(i, 1)
  })
  return out.length ? out : [blank]
}

export function removeWithIndented(cs: Cells, i: number, blank: Cell): Cells {
  const out = cs.filter((_, j) => j < i || j >= subtreeEnd(cs, i))
  return out.length ? out : [blank]
}

// Becomes the last child of its previous sibling (org-mode demote).
export function indent(cs: Cells, i: number): Cells {
  const d = cs[i].depth
  if (i === 0 || cs[i - 1].depth < d) return cs
  let p = i - 1
  while (cs[p].depth !== d) p--
  return produce(shift(cs, i, 1), (draft) => {
    draft[p].collapsed = false
  })
}

// Following siblings become its children, so nothing moves on screen (org-mode promote).
export function outdent(cs: Cells, i: number): Cells {
  if (cs[i].depth === 0) return cs
  return produce(shift(cs, i, -1), (draft) => {
    draft[i].collapsed = false // adopted siblings must not vanish
  })
}

export const toggleCollapse = (cs: Cells, i: number): Cells =>
  subtreeEnd(cs, i) > i + 1
    ? produce(cs, (draft) => {
        draft[i].collapsed = !draft[i].collapsed
      })
    : cs

export function langFromTitle(title: string): string | null {
  for (const [name] of title.matchAll(/[\w.-]+\.[A-Za-z][A-Za-z0-9]*/g)) {
    const desc = LanguageDescription.matchFilename(languages, name)
    if (desc) return desc.name
  }
  return null
}

export const setTitle = (cs: Cells, i: number, title: string): Cells =>
  produce(cs, (draft) => {
    const c = draft[i]
    c.title = title
    if (c.kind === 'code') c.lang = langFromTitle(title) ?? c.lang
  })

export const setBody = (cs: Cells, i: number, body: string): Cells =>
  produce(cs, (draft) => {
    draft[i].body = body
  })

export const setLang = (cs: Cells, i: number, lang: string): Cells =>
  produce(cs, (draft) => {
    const c = draft[i]
    if (c.kind === 'code') c.lang = lang
  })

export const setHeight = (cs: Cells, i: number, height: 'fit' | number): Cells =>
  produce(cs, (draft) => {
    const c = draft[i]
    if (c.kind === 'md') c.height = height
  })

export function dedent(text: string): string {
  const lines = text.split('\n')
  const indents = lines.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)![0].length)
  if (!indents.length) return text
  const n = Math.min(...indents)
  return lines.map((l) => l.slice(Math.min(n, /^[ \t]*/.exec(l)![0].length))).join('\n')
}
