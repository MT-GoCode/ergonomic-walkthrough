import { app } from 'electron'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { z } from 'zod'

const Entry = z.strictObject({
  autosavePath: z.string().nullable(),
  filePath: z.string().nullable(),
  bounds: z.strictObject({ x: z.int(), y: z.int(), width: z.int(), height: z.int() })
})
export type Entry = z.infer<typeof Entry>

const file = (): string => join(app.getPath('userData'), 'session.json')

export const readSession = (): Entry[] =>
  existsSync(file()) ? z.array(Entry).parse(JSON.parse(readFileSync(file(), 'utf8'))) : []

export function writeSession(entries: Entry[]): void {
  writeFileSync(`${file()}.tmp`, JSON.stringify(entries))
  renameSync(`${file()}.tmp`, file())
}
