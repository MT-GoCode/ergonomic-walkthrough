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

test('markdown: click focuses but stays rendered; double click or Enter edits raw; ⇧↩ renders (kills: click → edit)', async ({
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
  await page.keyboard.press('Shift+Enter')
  await expect(md.locator('.rendered strong')).toHaveText('bold')
  await md.locator('.rendered').click()
  await page.keyboard.press('Enter')
  await expect(md.locator('.cm-editor')).toBeVisible()
})

test('raw markdown survives leaving the window; it renders when another cell takes focus or on ⌘↩ (kills: blur renders / exit ignored)', async ({
  launch
}) => {
  const { app, page } = await launch([FIXTURE])
  const md = page.locator('.cell.md').first()
  const raw = () => md.locator('.cm-editor').count()
  await md.locator('.rendered').dblclick()
  await expect(md.locator('.cm-editor')).toBeVisible()
  // Leaving the window: the editor loses DOM focus and the window blurs, but no cell gains it.
  await page.evaluate(() => (document.activeElement as HTMLElement).blur())
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].blur())
  await page.waitForTimeout(200)
  expect(await raw()).toBe(1)
  await md.locator('.cm-content').click()
  await page.locator('.cell.code .cm-content').first().click()
  await expect.poll(raw).toBe(0)
  await md.locator('.rendered').dblclick()
  await expect(md.locator('.cm-editor')).toBeVisible()
  await page.keyboard.press('Meta+Enter')
  await expect.poll(raw).toBe(0)
  await expect(md.locator('.title')).toBeFocused()
})

test('rendered markdown: headings are sized, code blocks are one block highlighted like code cells (kills: plain fences / flat headings)', async ({
  launch
}, info) => {
  const { page } = await launch()
  // A code cell holding `def f` gives the reference colour for the keyword.
  await page.locator('.cm-content').first().click()
  await page.keyboard.insertText('def f(): pass')
  const strip = page.locator('.cell > .strip').first()
  await expect(async () => {
    await strip.hover()
    await strip.getByRole('button', { name: '+ MD', exact: true }).click({ timeout: 1000 })
  }).toPass()
  await page.keyboard.insertText(
    '# Crash course on Pytests\n\nA test is just a function:\n\n```python\ndef test_add():\n    assert 1 + 1 == 2\n```\n\n```nosuchlang\ndef x\n```'
  )
  await page.keyboard.press('Shift+Enter')
  const md = page.locator('.cell.md .rendered')
  await expect(md.locator('h1')).toHaveText('Crash course on Pytests')
  const px = (sel: string) =>
    md
      .locator(sel)
      .first()
      .evaluate((e) => parseFloat(getComputedStyle(e).fontSize))
  expect(await px('h1')).toBeGreaterThan(1.4 * (await px('p')))
  const colour = (loc: ReturnType<typeof page.locator>) =>
    loc.evaluate((e) => getComputedStyle(e).color)
  const cellDef = page.locator('.cell.code .cm-line span', { hasText: /^def$/ }).first()
  const fenceDef = md.locator('pre').first().locator('span', { hasText: /^def$/ })
  await expect(fenceDef).toHaveCount(1)
  expect(await colour(fenceDef)).toBe(await colour(cellDef))
  // One block: the <pre> is black, its <code> paints nothing per line.
  expect(
    await md
      .locator('pre')
      .first()
      .evaluate((e) => getComputedStyle(e).backgroundColor)
  ).toBe('rgb(0, 0, 0)')
  expect(
    await md
      .locator('pre code')
      .first()
      .evaluate((e) => getComputedStyle(e).backgroundColor)
  ).toBe('rgba(0, 0, 0, 0)')
  expect(await md.locator('pre').nth(1).locator('span').count()).toBe(0)
  await page.screenshot({ path: info.outputPath('markdown.png') })
})

test('a wrapped line continues under its own indentation, a little further in (kills: wrapped lines restart at column 0)', async ({
  launch
}) => {
  const { page } = await launch()
  await page.locator('.cm-content').first().click()
  await page.keyboard.insertText('    ' + 'word '.repeat(40))
  const rects = await page
    .locator('.cm-line')
    .first()
    .evaluate((line) => {
      const range = document.createRange()
      range.selectNodeContents(line)
      const boxes = [...range.getClientRects()].filter((r) => r.width > 0)
      // The first non-space character (offset 4), across the highlighter's text nodes.
      const walk = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
      let node = walk.nextNode() as Text
      let at = 4
      while (at >= node.length) {
        at -= node.length
        node = walk.nextNode() as Text
      }
      const first = document.createRange()
      first.setStart(node, at)
      first.setEnd(node, at + 1)
      // Where the second visual line starts: the leftmost box below the first one.
      const below = boxes.filter((b) => b.top > boxes[0].top + 1)
      return {
        lines: below.length,
        secondLeft: Math.min(...below.map((b) => b.left)),
        textLeft: first.getBoundingClientRect().left
      }
    })
  expect(rects.lines).toBeGreaterThan(0)
  expect(rects.secondLeft).toBeGreaterThan(rects.textLeft)
})
