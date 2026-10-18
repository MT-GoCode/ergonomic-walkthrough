import { readFileSync } from 'fs'
import { parseDoc } from '../../src/shared/doc'
import { chPx, expect, FIXTURE, recordPushes, test } from './app'

const fixture = parseDoc(readFileSync(FIXTURE, 'utf8')).cells

test('the HF trace renders every cell at its depth, 3 characters per level (kills: guide width ≠ 3ch)', async ({
  launch
}, info) => {
  const { page } = await launch([FIXTURE])
  const ch = await chPx(page)
  const rows = await page.$$eval('.cell', (els) =>
    els.map((e) => ({
      title: (e.querySelector('.title') as HTMLInputElement).value,
      left: e.getBoundingClientRect().left
    }))
  )
  expect(rows.map((r) => r.title)).toEqual(fixture.map((c) => c.title))
  const left0 = rows[0].left
  rows.forEach((r, i) =>
    expect(Math.abs(r.left - left0 - fixture[i].depth * 3 * ch), r.title).toBeLessThan(0.5)
  )
  await page.screenshot({ path: info.outputPath('hf-trace.png') })
})

test('exactly 88 characters fit on a line and the 89th wraps (kills: cell width ≠ cols·ch + padding)', async ({
  launch
}) => {
  const { page } = await launch()
  const editor = page.locator('.cell .cm-content').first()
  await editor.click()
  await page.keyboard.type('x'.repeat(88))
  const lh = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.querySelector('.cm-line')!).lineHeight)
  )
  const height = () =>
    page
      .locator('.cm-line')
      .first()
      .evaluate((e) => e.getBoundingClientRect().height)
  expect(await height()).toBeCloseTo(lh, 0)
  await page.keyboard.type('x')
  expect(await height()).toBeCloseTo(2 * lh, 0)
})

test('code editors are bare: no gutters, no completion popup, no lint, no spellcheck (kills: basicSetup defaults)', async ({
  launch
}) => {
  const { page } = await launch()
  await page.locator('.cm-content').first().click()
  await page.keyboard.type('pri')
  await page.waitForTimeout(500) // > CodeMirror's 100ms activateOnTypingDelay, so a popup would be open
  expect(await page.locator('.cm-gutters').count()).toBe(0)
  expect(await page.locator('.cm-tooltip-autocomplete').count()).toBe(0)
  expect(await page.locator('.cm-lintRange').count()).toBe(0)
  await expect(page.locator('.title').first()).toHaveAttribute('spellcheck', 'false')
})

test('typing pushes the edited doc to main, and opening one does not (kills: rev bumped on init)', async ({
  launch
}) => {
  const { app, page } = await launch([FIXTURE])
  const last = await recordPushes(app)
  await page.waitForTimeout(300)
  expect(await last()).toBeUndefined()
  await page.locator('.cell.code .cm-content').first().click()
  await page.keyboard.type('# traced')
  await expect.poll(async () => parseDoc((await last())!).cells[1].body).toContain('# traced')
})

test('a filename in the title re-highlights; a title without one keeps the language (kills: extension not reconfigured)', async ({
  launch
}) => {
  const { page } = await launch()
  await page.locator('.cm-content').first().click()
  await page.keyboard.type('# heading')
  const spans = () =>
    page.locator('.cm-line span').evaluateAll((s) => s.map((e) => e.className).join(' '))
  await expect.poll(spans).not.toBe('')
  const python = await spans()
  const title = page.locator('.title').first()
  await title.fill('README.md')
  await expect.poll(spans).not.toBe(python)
  const markdown = await spans()
  await title.fill('just notes')
  await page.waitForTimeout(300) // a language load would land within this
  expect(await spans()).toBe(markdown)
})

test('clicking a guide folds exactly its subtree and the placeholder counts it (kills: range bounds)', async ({
  launch
}) => {
  const { page } = await launch([FIXTURE])
  // The first guide belongs to __init__.py:441, whose subtree is cells 2–18 of the fixture.
  await page.locator('.guide').first().click()
  await expect(page.locator('.cell')).toHaveCount(3)
  await expect(page.locator('.folded')).toHaveText('▸ 17 cells')
  await page.locator('.folded').click()
  await expect(page.locator('.cell')).toHaveCount(fixture.length)
})

test('markdown: click focuses but stays rendered; double click or Enter edits raw; Esc renders (kills: click → edit)', async ({
  launch
}) => {
  const { page } = await launch([FIXTURE])
  const md = page.locator('.cell.md').first()
  await md.locator('.rendered').click()
  await expect(md).toHaveClass(/focused/)
  expect(await md.locator('.cm-editor').count()).toBe(0)
  await md.locator('.rendered').dblclick()
  await expect(md.locator('.cm-editor')).toBeVisible()
  await page.keyboard.press('End')
  await page.keyboard.type(' **bold**')
  await page.keyboard.press('Escape')
  await expect(md.locator('.rendered strong')).toHaveText('bold')
  await md.locator('.rendered').click()
  await page.keyboard.press('Enter')
  await expect(md.locator('.cm-editor')).toBeVisible()
})
