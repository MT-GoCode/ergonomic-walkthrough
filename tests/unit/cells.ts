import type { Cell } from '../../src/shared/doc'

// 'c1 B' → a code cell at depth 1 titled B ('m' = markdown, trailing '+' = collapsed).
export const mk = (...specs: string[]): Cell[] =>
  specs.map((s) => {
    const [, k, d, title, plus] = /^([cm])(\d) (\S+?)(\+?)$/.exec(s)!
    const common = { id: title, depth: +d, title, body: '', collapsed: plus === '+' }
    return k === 'c'
      ? { ...common, kind: 'code', lang: 'Python' }
      : { ...common, kind: 'md', height: 'fit' }
  })

export const shape = (cs: Cell[]): string[] =>
  cs.map((c) => `${c.kind === 'code' ? 'c' : 'm'}${c.depth} ${c.title}${c.collapsed ? '+' : ''}`)
