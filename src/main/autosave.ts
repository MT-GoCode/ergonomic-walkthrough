import { app, dialog } from 'electron'
import { mkdirSync } from 'fs'
import { rename, unlink, writeFile } from 'fs/promises'
import { join } from 'path'

// Lazy: index.ts redirects userData after this module is imported.
export const autosaveDir = (): string => join(app.getPath('userData'), 'autosaves')

// Single flight: one write in flight, and only the newest pending JSON is written next.
// One instance per path, so a reopened window and its predecessor's last write never race.
const instances = new Map<string, Autosave>()

export class Autosave {
  private pending: string | null = null
  private running: Promise<void> | null = null

  private constructor(readonly path: string) {}

  static at(path: string): Autosave {
    if (!instances.has(path)) instances.set(path, new Autosave(path))
    return instances.get(path)!
  }

  static create(uuid: string): Autosave {
    mkdirSync(autosaveDir(), { recursive: true })
    // sv-SE formats local time as "YYYY-MM-DD HH:MM:SS".
    const stamp = new Date().toLocaleString('sv-SE').replace(' ', '_').replaceAll(':', '-')
    return Autosave.at(join(autosaveDir(), `${stamp}-${uuid.slice(0, 6)}.walkthrough`))
  }

  push(json: string): void {
    this.pending = json
    this.running ??= this.drain()
  }

  flush(): Promise<void> {
    return this.running ?? Promise.resolve()
  }

  async discard(): Promise<void> {
    this.pending = null
    await this.flush()
    instances.delete(this.path)
    await unlink(this.path)
  }

  private async drain(): Promise<void> {
    try {
      for (let json = this.pending; json !== null; json = this.pending) {
        this.pending = null
        await writeFile(`${this.path}.tmp`, json)
        await rename(`${this.path}.tmp`, this.path)
      }
    } catch (err) {
      dialog.showErrorBox(`Autosave failed: ${this.path}`, String(err))
    } finally {
      this.running = null
    }
  }
}
