import { writeFileSync } from 'fs'
import type { Page } from '@playwright/test'
import { parseDoc } from '../../src/shared/doc'
import { click, expect, recordPushes, test, winId } from './app'

// Does exactly n characters fit on the first line of the first code cell?
const fits = async (page: Page, n: number) => {
  const editor = page.locator('.cell.code .cm-content').first()
  await editor.click()
  await page.keyboard.press('Meta+A')
  await page.keyboard.insertText('x'.repeat(n))
  return page.evaluate(() => {
    const line = document.querySelector<HTMLElement>('.cell.code .cm-line')!
    return (
      line.getBoundingClientRect().height <= parseFloat(getComputedStyle(line).lineHeight) + 0.5
    )
  })
}

const openSettings = async (app: Parameters<typeof click>[0], page: Page) => {
  await click(app, 'settings', await winId(app, page))
  await expect(page.locator('.settings')).toBeVisible()
}

test('cell width applies live to every window and persists across relaunch (kills: no broadcast / no write)', async ({
  launch
}, info) => {
  const userData = info.outputPath('ud')
  const { app, page } = await launch([], userData)
  const [b] = await Promise.all([app.waitForEvent('window'), click(app, 'newWindow')])
  await b.waitForSelector('.cell .cm-content')
  await openSettings(app, page)
  await page.locator('input[name=cols]').fill('100')
  await page.keyboard.press('Escape')
  await expect(page.locator('.settings')).toHaveCount(0)
  for (const p of [page, b]) {
    expect(await fits(p, 100)).toBe(true)
    expect(await fits(p, 101)).toBe(false)
  }
  await app.close()
  const again = await launch([], userData)
  expect(await fits(again.page, 100)).toBe(true)
  expect(await fits(again.page, 101)).toBe(false)
})

test('the default language, typed in any case, is what the next new code cell gets (kills: reducer ignores it)', async ({
  launch
}) => {
  const { app, page } = await launch()
  const last = await recordPushes(app)
  await openSettings(app, page)
  await page.locator('input[name=defaultLang]').fill('Rus')
  await expect(page.locator('input[name=defaultLang]')).toHaveClass(/invalid/)
  await page.locator('input[name=defaultLang]').fill('rust')
  await page.keyboard.press('Escape')
  const strip = page.locator('.cell > .strip').first()
  await strip.hover()
  await strip.getByRole('button', { name: '+ Code', exact: true }).click()
  await expect.poll(async () => parseDoc((await last())!).cells[1]).toMatchObject({ lang: 'Rust' })
})

test('an invalid value is marked and never sent (kills: unvalidated setSettings)', async ({
  launch
}) => {
  const { app, page } = await launch()
  const sent = () =>
    app.evaluate(({ ipcMain }) => {
      const g = globalThis as unknown as { sent?: number }
      if (g.sent === undefined) {
        g.sent = 0
        ipcMain.on('wt:setSettings', () => g.sent!++)
      }
      return g.sent
    })
  await sent()
  await openSettings(app, page)
  await page.locator('input[name=fontSize]').fill('0')
  await expect(page.locator('input[name=fontSize]')).toHaveClass(/invalid/)
  expect(await sent()).toBe(0)
  await page.locator('input[name=fontSize]').fill('14')
  expect(await sent()).toBe(0)
  await page.keyboard.press('Enter')
  await expect.poll(sent).toBe(1)
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).fontSize))
    .toBe('14px')
})

// `electron -r` (to stub the startup error box) exists only in the dev runner.
test('a corrupt settings.json is reported and the defaults apply (kills: silent parse failure)', async ({
  launch
}, info) => {
  const userData = info.outputPath('ud')
  test.skip(!!process.env.WT_EXECUTABLE, 'error-box preload needs the dev runner')
  const { app } = await launch([], userData)
  await app.close()
  writeFileSync(`${userData}/settings.json`, '{"cols": "wide"}')
  const { app: again, page } = await launch([], userData, { stubErrorBox: true })
  const boxes = await again.evaluate(
    () => (globalThis as unknown as { errorBoxes: string[] }).errorBoxes
  )
  expect(boxes).toEqual([`Ignoring invalid settings: ${userData}/settings.json`])
  expect(await fits(page, 88)).toBe(true)
  expect(await fits(page, 89)).toBe(false)
})
