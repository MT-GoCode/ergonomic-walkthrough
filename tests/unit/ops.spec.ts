import { expect, test } from '@playwright/test'
import { Doc, newCell, type Cell } from '../../src/shared/doc'
import * as ops from '../../src/shared/ops'
import { mk, shape } from './cells'

const blank = () => ({ ...mk('c0 blank')[0] })

test.describe('insertModes: every strip offers exactly the slots directly below it', () => {
  const doc = mk('c0 A', 'c1 B', 'c1 C', 'c0 D')
  test('expanded parent → plain insert becomes first child, ⇥ and ⇤ disabled (kills: open-parent branch removed)', () => {
    expect(ops.insertModes(doc, 0)).toEqual({ same: { index: 1, depth: 1 }, in: null, out: null })
  })
  test('leaf mid-group → same depth or one in, no ⇤ (kills: lastInGroup ignores next depth)', () => {
    expect(ops.insertModes(doc, 1)).toEqual({
      same: { index: 2, depth: 1 },
      in: { index: 2, depth: 2 },
      out: null
    })
  })
  test('last in group → ⇤ steps exactly one level out (kills: out depth d-1 → 0)', () => {
    expect(ops.insertModes(doc, 2)).toEqual({
      same: { index: 3, depth: 1 },
      in: { index: 3, depth: 2 },
      out: { index: 3, depth: 0 }
    })
  })
  test('depth-0 leaf at document end → no ⇤ (kills: d > 0 guard removed)', () => {
    expect(ops.insertModes(doc, 3).out).toBeNull()
  })
  test('collapsed parent → plain insert goes after the hidden subtree (kills: collapsed treated as open)', () => {
    expect(ops.insertModes(mk('c0 A+', 'c1 B', 'c1 C', 'c0 D'), 0)).toEqual({
      same: { index: 3, depth: 0 },
      in: { index: 1, depth: 1 },
      out: null
    })
  })
  test('expanded parent that is last in its group → no ⇤ (kills: out computed before open check)', () => {
    expect(ops.insertModes(mk('c0 A', 'c1 B', 'c2 C'), 1).out).toBeNull()
  })
  test('deepest leaf at document end → ⇤ to d-1', () => {
    expect(ops.insertModes(mk('c0 A', 'c1 B', 'c2 C'), 2).out).toEqual({ index: 3, depth: 1 })
  })
})

test.describe('ops', () => {
  const cell = (t: string): Cell => ({ ...newCell('md', 9, 'Python'), id: t, title: t })
  test('insert ⇥ on a collapsed parent expands it and lands as first child (kills: expand clause removed)', () => {
    const cs = mk('c0 A+', 'c1 B')
    expect(shape(ops.insert(cs, 0, ops.insertModes(cs, 0).in!, cell('N')))).toEqual([
      'c0 A',
      'm1 N',
      'c1 B'
    ])
  })
  test('remove promotes the subtree one level (kills: promotion loop removed)', () => {
    expect(shape(ops.remove(mk('c0 A', 'c1 B', 'c2 C', 'c3 X', 'c1 D'), 1, blank()))).toEqual([
      'c0 A',
      'c1 C',
      'c2 X',
      'c1 D'
    ])
  })
  test('removing the only cell leaves one blank code cell (kills: empty result returned)', () => {
    expect(shape(ops.remove(mk('c0 A'), 0, blank()))).toEqual(['c0 blank'])
    expect(shape(ops.removeWithIndented(mk('c0 A', 'c1 B'), 0, blank()))).toEqual(['c0 blank'])
  })
  test('removeWithIndented drops exactly the subtree (kills: subtreeEnd off by one)', () => {
    expect(shape(ops.removeWithIndented(mk('c0 A', 'c1 B', 'c2 C', 'c1 D'), 1, blank()))).toEqual([
      'c0 A',
      'c1 D'
    ])
  })
  test('indent demotes into the previous sibling and opens it (kills: sibling search / expand removed)', () => {
    expect(shape(ops.indent(mk('c0 A+', 'c1 B', 'c0 C', 'c1 D'), 2))).toEqual([
      'c0 A',
      'c1 B',
      'c1 C',
      'c2 D'
    ])
  })
  test('indent is a no-op on the first cell and under a shallower cell (kills: guard removed)', () => {
    const a = mk('c0 A', 'c1 B')
    expect(ops.indent(a, 0)).toBe(a)
    expect(ops.indent(a, 1)).toBe(a)
  })
  test('outdent keeps everything in place; following siblings become children (kills: shift range wrong)', () => {
    expect(shape(ops.outdent(mk('c0 A', 'c1 B', 'c2 C', 'c1 D'), 1))).toEqual([
      'c0 A',
      'c0 B',
      'c1 C',
      'c1 D'
    ])
  })
  test('a selected range indents as one block, children of selected cells included (kills: block end)', () => {
    expect(shape(ops.indent(mk('c0 A', 'c1 B', 'c0 C', 'c0 D', 'c1 E', 'c0 F'), 2, 3))).toEqual([
      'c0 A',
      'c1 B',
      'c1 C',
      'c1 D',
      'c2 E',
      'c0 F'
    ])
  })
  test('a selected range outdents as one block; the next sibling is adopted, never hidden (kills: range expand)', () => {
    const cs = ops.outdent(mk('c0 A', 'c1 B', 'c1 D+', 'c2 X', 'c1 F'), 1, 2)
    expect(shape(cs)).toEqual(['c0 A', 'c0 B', 'c0 D', 'c1 X', 'c1 F'])
    expect(ops.visible(cs)).toEqual([0, 1, 2, 3, 4])
  })
  test('a range reaching the outer level cannot outdent (kills: depth-0 guard)', () => {
    const cs = mk('c0 A', 'c1 B', 'c0 C')
    expect(ops.outdent(cs, 1, 2)).toBe(cs)
  })
  test('outdenting a collapsed cell opens it so adopted siblings stay visible (kills: outdent expand removed)', () => {
    const cs = ops.outdent(mk('c0 A', 'c1 B+', 'c2 C', 'c1 D'), 1)
    expect(shape(cs)).toEqual(['c0 A', 'c0 B', 'c1 C', 'c1 D'])
    expect(ops.visible(cs)).toEqual([0, 1, 2, 3])
  })
  test('toggle flips only parents (kills: kids guard removed)', () => {
    const a = mk('c0 A', 'c1 B')
    expect(ops.toggleCollapse(a, 1)).toBe(a)
    expect(shape(ops.toggleCollapse(a, 0))).toEqual(['c0 A+', 'c1 B'])
  })
  test('visible hides exactly the collapsed subtrees (kills: hideBelow reset missing)', () => {
    expect(ops.visible(mk('c0 A', 'c1 B+', 'c2 C', 'c3 X', 'c1 D', 'c0 E+', 'c1 F'))).toEqual([
      0, 1, 4, 5
    ])
  })
  test('language follows a filename in the title, and only a filename (kills: regex allows numeric ext)', () => {
    const lang = (t: string) => (ops.setTitle(mk('c0 A'), 0, t)[0] as { lang: string }).lang
    const cases = [
      'base.py:300',
      'main.js:12',
      'x.rs:1',
      'transformers/pipelines/base.ts:3',
      'v4.2 loading',
      'index:134'
    ]
    expect(
      cases.map((t) => ops.setTitle([{ ...mk('c0 A')[0], lang: 'Go' }], 0, t)[0])
    ).toMatchObject([
      { lang: 'Python' },
      { lang: 'JavaScript' },
      { lang: 'Rust' },
      { lang: 'TypeScript' },
      { lang: 'Go' },
      { lang: 'Go' }
    ])
    expect(lang('balls')).toBe('Python')
  })
  test('dedent strips the common indent only (kills: min over blank lines)', () => {
    expect(ops.dedent('    a\n      b\n\n    c')).toBe('a\n  b\n\nc')
    expect(ops.dedent('\tx\n\ty')).toBe('x\ny')
    expect(ops.dedent('   ')).toBe('   ')
  })
})

// mulberry32: tiny seeded PRNG so a failure is reproducible from its seed.
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

test('10k random ops keep the invariant, never adopt, never move survivors', () => {
  const r = rng(1)
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)]
  let cs = mk('c0 root')
  let n = 0
  for (let step = 0; step < 10000; step++) {
    const vis = ops.visible(cs)
    const i = pick(vis)
    const before = cs
    // Range ops act on [i, j]; the block they move runs to the first later cell no deeper
    // than the shallowest selected one (derived here independently of ops.ts).
    const j = Math.min(cs.length - 1, i + Math.floor(r() * 4))
    const m = Math.min(...cs.slice(i, j + 1).map((c) => c.depth))
    let end = j + 1
    while (end < cs.length && cs[end].depth > m) end++
    const kind = pick(['code', 'md'] as const)
    const op = pick([
      'insert',
      'insert',
      'insert',
      'remove',
      'removeWithIndented',
      'indent',
      'outdent',
      'toggle'
    ])
    let fresh: string | null = null
    if (op === 'insert') {
      const slot = ops.insertModes(cs, i)[pick(['same', 'in', 'out'] as const)]
      if (!slot) continue
      fresh = `n${n++}`
      cs = ops.insert(cs, i, slot, { ...newCell(kind, 0, 'Python'), id: fresh, title: fresh })
    } else if (op === 'remove') cs = ops.remove(cs, i, { ...blank(), id: `n${n++}` })
    else if (op === 'removeWithIndented')
      cs = ops.removeWithIndented(cs, i, { ...blank(), id: `n${n++}` })
    else if (op === 'indent') cs = ops.indent(cs, i, j)
    else if (op === 'outdent') cs = ops.outdent(cs, i, j)
    else cs = ops.toggleCollapse(cs, i)

    const ctx = `step ${step} ${op} at ${i}..${j}`
    expect(Doc.safeParse({ format: 'walkthrough', version: 1, cells: cs }).success, ctx).toBe(true)
    const old = new Map(before.map((c) => [c.id, c]))
    const survivors = cs.filter((c) => old.has(c.id)).map((c) => c.id)
    expect(survivors, ctx).toEqual(before.map((c) => c.id).filter((id) => survivors.includes(id)))
    const ranged = op === 'indent' || op === 'outdent'
    const target = new Set(
      before.slice(i, ranged ? end : ops.subtreeEnd(before, i)).map((c) => c.id)
    )
    if (ranged && cs !== before)
      // The block moved as one: every cell in it shifted by the same amount.
      expect(new Set(before.slice(i, end).map((c, k) => cs[i + k].depth - c.depth)).size, ctx).toBe(
        1
      )
    for (const c of cs)
      if (old.has(c.id) && !target.has(c.id))
        expect(c.depth, `${ctx} moved ${c.id}`).toBe(old.get(c.id)!.depth)
    if (fresh) {
      const v = ops.visible(cs).map((j) => cs[j].id)
      expect(v[v.indexOf(before[i].id) + 1], `${ctx} not directly below`).toBe(fresh)
      for (const c of cs)
        if (c.id !== fresh) expect(c.depth, `${ctx} adopted`).toBe(old.get(c.id)!.depth)
    }
  }
  expect(n).toBeGreaterThan(2000)
})
