import { app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { z } from 'zod'
import { atomicWrite } from './atomic'

const Entry = z.strictObject({
  autosavePath: z.string().nullable(),
  filePath: z.string().nullable(),
  bounds: z.strictObject({ x: z.int(), y: z.int(), width: z.int(), height: z.int() })
})
export type Entry = z.infer<typeof Entry>

const file = (): string => join(app.getPath('userData'), 'session.json')

export const readSession = (): Entry[] =>
  existsSync(file()) ? z.array(Entry).parse(JSON.parse(readFileSync(file(), 'utf8'))) : []

export const writeSession = (entries: Entry[]): void => atomicWrite(file(), JSON.stringify(entries))
