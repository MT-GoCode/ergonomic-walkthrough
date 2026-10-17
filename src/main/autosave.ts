import { app, dialog } from 'electron'
import { mkdirSync } from 'fs'
import { rename, writeFile } from 'fs/promises'
import { join } from 'path'

// Lazy: index.ts redirects userData after this module is imported.
export const autosaveDir = (): string => join(app.getPath('userData'), 'autosaves')

// Single flight: one write in flight, and only the newest pending JSON is written next.
export class Autosave {
  private pending: string | null = null
  private running: Promise<void> | null = null

  constructor(readonly path: string) {}

  static create(uuid: string): Autosave {
    mkdirSync(autosaveDir(), { recursive: true })
    // sv-SE formats local time as "YYYY-MM-DD HH:MM:SS".
    const stamp = new Date(Date.now())
      .toLocaleString('sv-SE')
      .replace(' ', '_')
      .replaceAll(':', '-')
    return new Autosave(join(autosaveDir(), `${stamp}-${uuid.slice(0, 6)}.walkthrough`))
  }

  push(json: string): void {
    this.pending = json
    this.running ??= this.drain()
  }

  flush(): Promise<void> {
    return this.running ?? Promise.resolve()
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
