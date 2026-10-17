import { test as base, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { join } from 'path'

const ROOT = join(__dirname, '../..')
export const FIXTURE = join(ROOT, 'tests/fixtures/hf-trace.walkthrough')

type Launched = { app: ElectronApplication; page: Page }

// Every launch gets its own userData, runs without taking focus, and leaves a trace.zip.
export const test = base.extend<{ launch: (files?: string[]) => Promise<Launched> }>({
  launch: async ({}, use, info) => {
    const apps: ElectronApplication[] = []
    await use(async (files = []) => {
      const app = await _electron.launch({
        args: [join(ROOT, 'out/main/index.js'), ...files],
        env: { ...process.env, WT_SHOW_INACTIVE: '1', WT_USER_DATA: info.outputPath(`userdata-${apps.length}`) }
      })
      apps.push(app)
      await app.context().tracing.start({ screenshots: true, snapshots: true })
      const page = await app.firstWindow()
      await page.waitForSelector('.cell .cm-content')
      return { app, page }
    })
    for (const [k, app] of apps.entries()) {
      await app.context().tracing.stop({ path: info.outputPath(`trace-${k}.zip`) })
      await app.close()
    }
  }
})
export { expect } from '@playwright/test'

// Records every doc the renderer pushes to main; returns a getter for the latest.
export async function recordPushes(app: ElectronApplication): Promise<() => Promise<string | undefined>> {
  await app.evaluate(({ ipcMain }) => {
    const g = globalThis as unknown as { pushes: string[] }
    g.pushes = []
    ipcMain.on('wt:docChanged', (_e, json: string) => g.pushes.push(json))
  })
  return () => app.evaluate(() => (globalThis as unknown as { pushes: string[] }).pushes.at(-1))
}

// Width of one monospace character in the cell font, measured, never assumed.
export const chPx = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const s = document.createElement('span')
    s.textContent = 'x'.repeat(100)
    s.style.font = getComputedStyle(document.querySelector('.cell')!).font
    document.body.append(s)
    const w = s.getBoundingClientRect().width / 100
    s.remove()
    return w
  })
