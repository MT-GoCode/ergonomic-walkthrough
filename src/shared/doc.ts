import { z } from 'zod'
import { languages } from '@codemirror/language-data'

const LANG_NAMES = languages.map((l) => l.name) as [string, ...string[]]

const base = {
  id: z.string().min(1),
  depth: z.int().min(0),
  title: z.string(),
  body: z.string(),
  collapsed: z.boolean()
}

const CodeCell = z.strictObject({ ...base, kind: z.literal('code'), lang: z.enum(LANG_NAMES) })
// height is in lines so it survives font changes; 'fit' grows with content up to the window.
const MdCell = z.strictObject({
  ...base,
  kind: z.literal('md'),
  height: z.union([z.literal('fit'), z.int().min(1)])
})
const Cell = z.discriminatedUnion('kind', [CodeCell, MdCell])

// A flat preorder list; depth encodes the tree. The refinement is the only place
// the shape is validated — every op in ops.ts preserves it.
export const Doc = z
  .strictObject({
    format: z.literal('walkthrough'),
    version: z.literal(1),
    cells: z.array(Cell).min(1)
  })
  .superRefine(({ cells }, ctx) => {
    const ids = new Set<string>()
    cells.forEach((c, i) => {
      const max = i === 0 ? 0 : cells[i - 1].depth + 1
      if (c.depth > max)
        ctx.addIssue({
          code: 'custom',
          path: ['cells', i, 'depth'],
          message: `depth must be <= ${max}`
        })
      if (ids.has(c.id))
        ctx.addIssue({ code: 'custom', path: ['cells', i, 'id'], message: 'duplicate id' })
      ids.add(c.id)
    })
  })

export type Cell = z.infer<typeof Cell>
export type Doc = z.infer<typeof Doc>
export type Kind = Cell['kind']

export const parseDoc = (text: string): Doc => Doc.parse(JSON.parse(text))

export const serializeDoc = (cells: Cell[]): string =>
  JSON.stringify({ format: 'walkthrough', version: 1, cells }, null, 2) + '\n'

export function newCell(kind: Kind, depth: number, lang: string): Cell {
  const common = { id: crypto.randomUUID(), depth, title: '', body: '', collapsed: false }
  return kind === 'code' ? { ...common, kind, lang } : { ...common, kind, height: 'fit' }
}

export const newDoc = (lang: string): Doc => ({
  format: 'walkthrough',
  version: 1,
  cells: [newCell('code', 0, lang)]
})
