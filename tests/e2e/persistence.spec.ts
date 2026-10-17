import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'fs'
import { join } from 'path'
import type { ElectronApplication, Page } from '@playwright/test'
import { parseDoc, serializeDoc } from '../../src/shared/doc'
import { click, expect, FIXTURE, recordPushes, test, winId } from './app'

// Main-process scratch for dialog/focus stubs; evaluate callbacks cannot close over test helpers.
type G = { calls: unknown[]; answer: number }

const loaded = async (page: Page) => {
  await page.waitForSelector('.cell .cm-content')
  return page
}

// Opens a file through File > Open… with the native dialog stubbed; resolves to its new window.
async function open(app: ElectronApplication, path: string): Promise<void> {
  await app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as never
  }, path)
  await click(app, 'open')
}
const openNew = async (app: ElectronApplication, path: string) =>
  loaded((await Promise.all([app.waitForEvent('window'), open(app, path)]))[0])

async function typeIn(page: Page, text: string): Promise<void> {
  await page.locator('.cell.code .cm-content').first().click()
  await page.keyboard.type(text)
}

const windows = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) =>
    Promise.all(
      BrowserWindow.getAllWindows().map(async (w) => ({
        title: w.getTitle(),
        edited: w.isDocumentEdited(),
        bounds: w.getBounds(),
        text: (await w.webContents.executeJavaScript(
          `[...document.querySelectorAll('.cm-content')].map((e) => e.textContent).join('\\n')`
        )) as string
      }))
    ).then((ws) => ws.sort((a, b) => a.title.localeCompare(b.title)))
  )

// Counted without touching webContents, which never answers while its window closes.
const count = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)

const autosaves = (userData: string): string[] =>
  existsSync(join(userData, 'autosaves'))
    ? readdirSync(join(userData, 'autosaves')).filter((f) => !f.endsWith('.tmp'))
    : []

async function quit(app: ElectronApplication): Promise<void> {
  await Promise.all([
    app.waitForEvent('close'),
    app.evaluate(({ app }) => void setTimeout(() => app.quit()))
  ])
}

// Records every call to a dialog function and answers with the scratch `answer`.
const stubDialog = (
  app: ElectronApplication,
  fn: 'showMessageBoxSync' | 'showErrorBox',
  answer = 0
) =>
  app.evaluate(
    ({ dialog }, [fn, answer]) => {
      const s = globalThis as unknown as G
      s.calls = []
      s.answer = answer
      dialog[fn] = ((...args: unknown[]) => (s.calls.push(args.map(String)), s.answer)) as never
    },
    [fn, answer] as const
  )
const calls = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as unknown as G).calls as string[][])

test('quit and relaunch restores every window with its doc, bounds and dirty state (kills: session not rewritten at quit / file preferred over autosave / dirty ignores file text)', async ({
  launch
}, info) => {
  const ud = info.outputPath('ud')
  const file = info.outputPath('saved.walkthrough')
  copyFileSync(FIXTURE, file)
  const { app, page: untitled } = await launch([], ud)
  const saved = await openNew(app, file)
  await typeIn(untitled, 'MARK_A')
  await typeIn(saved, 'MARK_B')
  await expect.poll(() => autosaves(ud).length).toBe(2)
  // Bounds change after the last path change, so only the quit-time session write records them.
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().forEach((w, i) =>
      w.setBounds({ x: 40 + 90 * i, y: 60 + 50 * i, width: 700, height: 640 - 40 * i })
    )
  )
  const before = await windows(app)
  expect(before.map((w) => [w.title, w.edited])).toEqual([
    ['saved.walkthrough', true],
    ['Untitled', false]
  ])
  await quit(app)

  const { app: again } = await launch([], ud)
  await expect.poll(() => again.windows().length).toBe(2)
  await Promise.all(again.windows().map(loaded))
  const after = await windows(again)
  expect(after.map(({ title, edited, bounds }) => ({ title, edited, bounds }))).toEqual(
    before.map(({ title, edited, bounds }) => ({ title, edited, bounds }))
  )
  expect(after[0].text).toContain('MARK_B')
  expect(after[1].text).toContain('MARK_A')
})

test('after SIGKILL the relaunched window shows the last pushed doc (kills: session not written when the autosave is created)', async ({
  launch
}, info) => {
  const ud = info.outputPath('ud')
  const { app, page } = await launch([], ud)
  await typeIn(page, 'first')
  await expect.poll(() => autosaves(ud).length).toBe(1)
  await page.keyboard.type('-last')
  const path = join(ud, 'autosaves', autosaves(ud)[0])
  await expect.poll(() => parseDoc(readFileSync(path, 'utf8')).cells[0].body).toBe('first-last')
  await Promise.all([app.waitForEvent('close'), app.process().kill('SIGKILL')])

  const { page: again } = await launch([], ud)
  await expect(again.locator('.cell.code .cm-content').first()).toHaveText('first-last')
})

test('an opened or new window writes no autosave until it is edited (kills: autosave created with the window)', async ({
  launch
}, info) => {
  const ud = info.outputPath('ud')
  const { app, page } = await launch([FIXTURE], ud)
  await Promise.all([app.waitForEvent('window'), click(app, 'newWindow')])
  await page.waitForTimeout(500) // several frames, so any push on load would have landed
  expect(autosaves(ud)).toEqual([])
  await typeIn(page, 'x')
  await expect.poll(() => autosaves(ud).length).toBe(1)
})

test('two windows first edited in the same second get two autosave files (kills: name without the window uuid)', async ({
  launch
}, info) => {
  const ud = info.outputPath('ud')
  const { app, page } = await launch([], ud)
  const other = await loaded(
    (await Promise.all([app.waitForEvent('window'), click(app, 'newWindow')]))[0]
  )
  await app.evaluate(() => void (Date.now = () => 1_760_000_000_000))
  await typeIn(page, 'a')
  await typeIn(other, 'b')
  await expect.poll(() => autosaves(ud).length).toBe(2)
  const [x, y] = autosaves(ud)
  expect(x.slice(0, 19)).toBe(y.slice(0, 19))
  expect(x).toMatch(/^\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d-[0-9a-f]{6}\.walkthrough$/)
})

test('Save As writes exactly the pushed doc, clears dirty, and an edit sets it again (kills: stale json written / saved text not recorded)', async ({
  launch
}, info) => {
  const target = info.outputPath('out.walkthrough')
  const { app, page } = await launch()
  const last = await recordPushes(app)
  await typeIn(page, 'saved text')
  await expect.poll(async () => (await last()) ?? '').toContain('saved text')
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: p })) as never
  }, target)
  await click(app, 'saveAs', await winId(app, page))
  await expect.poll(() => existsSync(target)).toBe(true)
  const pushed = (await last())!
  expect(readFileSync(target, 'utf8')).toBe(pushed)
  expect(pushed).toBe(serializeDoc(parseDoc(pushed).cells))
  expect((await windows(app)).map((w) => [w.title, w.edited])).toEqual([['out.walkthrough', false]])
  await page.keyboard.type('!')
  await expect.poll(async () => (await windows(app))[0].edited).toBe(true)
})

test('closing a dirty saved file prompts and Cancel keeps it; an untitled window never prompts (kills: no prompt / Cancel ignored / untitled prompts)', async ({
  launch
}, info) => {
  const file = info.outputPath('f.walkthrough')
  copyFileSync(FIXTURE, file)
  const { app, page } = await launch([file])
  await typeIn(page, 'edit')
  await expect.poll(async () => (await windows(app))[0].edited).toBe(true)
  await stubDialog(app, 'showMessageBoxSync', 2)
  const close = () =>
    app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.close()))
  await close()
  expect((await calls(app)).length).toBe(1)
  expect(await count(app)).toBe(1)

  await app.evaluate(() => void ((globalThis as unknown as G).answer = 1))
  await close()
  await expect.poll(() => count(app)).toBe(0)

  const untitled = await loaded(
    (await Promise.all([app.waitForEvent('window'), click(app, 'newWindow')]))[0]
  )
  await typeIn(untitled, 'scratch')
  await expect.poll(async () => (await windows(app))[0].text).toContain('scratch')
  await close()
  await expect.poll(() => count(app)).toBe(0)
  expect((await calls(app)).length).toBe(2)
})

test('Reopen Closed Window restores its doc; opening an open file focuses it (kills: closed stack unused / no already-open check)', async ({
  launch
}, info) => {
  const ud = info.outputPath('ud')
  const file = info.outputPath('f.walkthrough')
  copyFileSync(FIXTURE, file)
  const { app, page } = await launch([], ud)
  await typeIn(page, 'come back')
  await expect.poll(() => autosaves(ud).length).toBe(1)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await expect.poll(() => count(app)).toBe(0)
  const back = await loaded(
    (await Promise.all([app.waitForEvent('window'), click(app, 'reopenClosed')]))[0]
  )
  await expect(back.locator('.cell.code .cm-content').first()).toHaveText('come back')

  const opened = await openNew(app, file)
  await app.evaluate(({ BrowserWindow }) => {
    const s = globalThis as unknown as G
    s.calls = []
    BrowserWindow.prototype.focus = function (this: { id: number }) {
      s.calls.push(this.id)
    }
  })
  await open(app, file)
  await expect
    .poll(() => app.evaluate(() => (globalThis as unknown as G).calls))
    .toEqual([await winId(app, opened)])
  expect(await count(app)).toBe(2)
})

test('a file that fails validation shows an error box with the zod path and opens no window (kills: unvalidated open)', async ({
  launch
}, info) => {
  const bad = info.outputPath('bad.walkthrough')
  const doc = parseDoc(readFileSync(FIXTURE, 'utf8'))
  doc.cells[0].depth = 3
  writeFileSync(bad, JSON.stringify(doc))
  const { app } = await launch()
  await stubDialog(app, 'showErrorBox')
  await open(app, bad)
  await expect.poll(async () => (await calls(app)).length).toBe(1)
  const [[title, message]] = await calls(app)
  expect(title).toContain(bad)
  expect(message).toMatch(/"cells",\s*0,\s*"depth"/)
  expect(await count(app)).toBe(1)
})

test('a save issued right after a keystroke always contains it, 20 times in a row (kills: save reads json without a renderer flush)', async ({
  launch
}, info) => {
  const path = info.outputPath('race.walkthrough')
  copyFileSync(FIXTURE, path)
  const { app, page } = await launch([path])
  const id = await winId(app, page)
  await page.locator('.cell.code .cm-content').first().click()
  for (let k = 0; k < 20; k++) {
    await page.keyboard.type(`#${k}`)
    await click(app, 'save', id)
    await expect.poll(() => readFileSync(path, 'utf8')).toContain(`#${k}`)
  }
  expect((await windows(app)).map((w) => w.edited)).toEqual([false])
})

test('choosing Save in the close prompt writes the file and closes (kills: prompt choice 0 ignored)', async ({
  launch
}, info) => {
  const path = info.outputPath('close-save.walkthrough')
  copyFileSync(FIXTURE, path)
  const { app, page } = await launch([path])
  await typeIn(page, 'saved on close')
  await stubDialog(app, 'showMessageBoxSync', 0)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await expect.poll(() => count(app)).toBe(0)
  expect(
    parseDoc(readFileSync(path, 'utf8'))
      .cells.map((c) => c.body)
      .join('')
  ).toContain('saved on close')
})

test('saving drops the autosave, so a relaunch reads the file even after it changed on disk (kills: stale autosave kept)', async ({
  launch
}, info) => {
  const ud = info.outputPath('ud')
  const path = info.outputPath('pulled.walkthrough')
  copyFileSync(FIXTURE, path)
  const { app, page } = await launch([path], ud)
  await typeIn(page, 'local edit')
  await expect.poll(() => autosaves(ud).length).toBe(1)
  await click(app, 'save', await winId(app, page))
  await expect.poll(() => autosaves(ud).length).toBe(0)
  await quit(app)
  const pulled = parseDoc(readFileSync(path, 'utf8'))
  pulled.cells[0].title = 'changed by git pull'
  writeFileSync(path, serializeDoc(pulled.cells))
  const again = await launch([], ud)
  await expect(again.page.locator('.title').first()).toHaveValue('changed by git pull')
  expect((await windows(again.app)).map((w) => w.edited)).toEqual([false])
})

test('a Save As that cannot write shows an error and leaves the window untitled (kills: silent save failure)', async ({
  launch
}, info) => {
  const { app, page } = await launch()
  await typeIn(page, 'x')
  await stubDialog(app, 'showErrorBox')
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: p })) as never
  }, info.outputPath('no/such/dir/out.walkthrough'))
  await click(app, 'saveAs', await winId(app, page))
  await expect.poll(async () => (await calls(app)).length).toBe(1)
  expect((await calls(app))[0][0]).toContain('Cannot save')
  expect((await windows(app)).map((w) => w.title)).toEqual(['Untitled'])
})

test('if Save in the close prompt fails, the error shows and the window stays open (kills: failed save reported as saved)', async ({
  launch
}, info) => {
  const dir = info.outputPath('locked')
  mkdirSync(dir)
  const path = join(dir, 'locked.walkthrough')
  copyFileSync(FIXTURE, path)
  const { app, page } = await launch([path])
  await typeIn(page, 'unsaveable')
  chmodSync(dir, 0o555)
  try {
    await app.evaluate(({ dialog }) => {
      const g = globalThis as unknown as { errors: string[] }
      g.errors = []
      dialog.showMessageBoxSync = (() => 0) as never
      dialog.showErrorBox = ((title: string) => g.errors.push(title)) as never
    })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
    await expect
      .poll(() => app.evaluate(() => (globalThis as unknown as { errors: string[] }).errors))
      .toEqual([`Cannot save ${path}`])
    expect(await count(app)).toBe(1)
  } finally {
    chmodSync(dir, 0o755)
  }
})
