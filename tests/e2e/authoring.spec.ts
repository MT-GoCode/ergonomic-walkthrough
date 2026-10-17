import type { Page } from '@playwright/test'
import { parseDoc } from '../../src/shared/doc'
import { expect, FIXTURE, recordPushes, test } from './app'

const cellTitled = async (page: Page, title: string) => {
  const i = await page.$$eval(
    '.cell .title',
    (els, t) => els.findIndex((e) => (e as HTMLInputElement).value === t),
    title
  )
  expect(i, `cell "${title}"`).toBeGreaterThanOrEqual(0)
  return page.locator('.cell').nth(i)
}

// Hover the bottom border of a cell and click one of its insert buttons.
const insertBelow = async (page: Page, title: string, label: string) => {
  const strip = (await cellTitled(page, title)).locator(':scope > .strip')
  await strip.hover()
  await strip.getByRole('button', { name: label, exact: true }).click()
}

const shape = (json: string) =>
  parseDoc(json).cells.map((c) => `${c.kind === 'code' ? 'c' : 'm'}${c.depth} ${c.title}`)

// Where keyboard focus is: which cell (by fixture index) and whether in its title or body.
const where = (page: Page) =>
  page.evaluate(() => {
    const a = document.activeElement!
    const cell = a.closest<HTMLElement>('.cell')!
    const i = [...document.querySelectorAll('.cell')].indexOf(cell)
    return `${(cell.querySelector('.title') as HTMLInputElement).value || `#${i}`}:${a.classList.contains('title') ? 'title' : 'body'}`
  })

test('mouse only: the mockup trace is built in reading order, out of the dive via ⇤ (kills: wrong slot / focus)', async ({
  launch
}) => {
  const { app, page } = await launch()
  const last = await recordPushes(app)
  await page.locator('.title').first().click()
  await page.keyboard.type('index:134')
  await insertBelow(page, 'index:134', '+ Code ⇥')
  await page.keyboard.type('main.js:12')
  await insertBelow(page, 'main.js:12', '+ MD')
  await expect(page.locator('.cell.md .cm-content')).toBeFocused()
  await page.keyboard.type('why we dive')
  await page.keyboard.press('Escape')
  await page.keyboard.type('entrypoint discussion')
  await insertBelow(page, 'entrypoint discussion', '+ Code')
  await page.keyboard.type('main.js:50')
  await insertBelow(page, 'main.js:50', '+ Code ⇥')
  await page.keyboard.type('deep')
  await insertBelow(page, 'deep', '+ Code ⇤')
  await page.keyboard.type('back')
  await insertBelow(page, 'back', '+ Code ⇤')
  await page.keyboard.type('bottom')
  await expect
    .poll(async () => shape((await last())!))
    .toEqual([
      'c0 index:134',
      'c1 main.js:12',
      'm1 entrypoint discussion',
      'c1 main.js:50',
      'c2 deep',
      'c1 back',
      'c0 bottom'
    ])
  expect(parseDoc((await last())!).cells[2].body).toBe('why we dive')
  expect(parseDoc((await last())!).cells[1]).toMatchObject({ lang: 'JavaScript' })
})

test('Tab and Shift+Tab in a title move the cell in and out and keep typing focus (kills: remount loses focus)', async ({
  launch
}) => {
  const { app, page } = await launch([FIXTURE])
  const last = await recordPushes(app)
  const title = (await cellTitled(page, '__init__.py:743 resolve task')).locator('.title')
  await title.click()
  await page.keyboard.press('Tab')
  await expect.poll(async () => parseDoc((await last())!).cells[3].depth).toBe(2)
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Shift+Tab')
  await expect.poll(async () => parseDoc((await last())!).cells[3].depth).toBe(0)
  await page.keyboard.type('!')
  expect(parseDoc((await last())!).cells[3].title).toBe('__init__.py:743 resolve task!')
})

test('the markdown handle drags in whole lines between 1 and the window, double click fits (kills: clamp)', async ({
  launch
}) => {
  const { page } = await launch([FIXTURE])
  const cell = page.locator('.cell.md').nth(1)
  const box = cell.locator('.mdbox')
  const handle = cell.locator(':scope > .strip .handle')
  const drag = async (dy: number) => {
    await cell.locator(':scope > .strip').hover()
    const h = (await handle.boundingBox())!
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
    await page.mouse.down()
    await page.mouse.move(h.x + h.width / 2, h.y + dy, { steps: 4 })
    await page.mouse.up()
  }
  const m = () =>
    box.evaluate((b) => ({
      h: b.getBoundingClientRect().height,
      lh: parseFloat(getComputedStyle(b).lineHeight),
      title: b.closest('.cell')!.querySelector<HTMLElement>('.titlebar')!.offsetHeight,
      win: innerHeight,
      content: b.scrollHeight
    }))
  await drag(10000)
  let s = await m()
  expect(s.h + s.title).toBeLessThanOrEqual(s.win)
  expect(s.h + s.lh + s.title).toBeGreaterThan(s.win)
  expect(Math.abs(s.h / s.lh - Math.round(s.h / s.lh))).toBeLessThan(0.05)
  await drag(-10000)
  s = await m()
  expect(s.h).toBeCloseTo(s.lh, 0)
  await cell.locator(':scope > .strip').hover()
  await handle.dblclick()
  s = await m()
  expect(s.h).toBeCloseTo(s.content, 0)
})

test('arrows walk titles and bodies across cells, skip folded ones, never open markdown (kills: nav order)', async ({
  launch
}) => {
  const { page } = await launch([FIXTURE])
  await page.locator('.guide').nth(1).click() // fold the 2 cells under __init__.py:743
  await page.locator('.title').first().click()
  const seen: string[] = [await where(page)]
  for (let k = 0; k < 120 && seen.length < 7; k++) {
    await page.keyboard.press('ArrowDown')
    const w = await where(page)
    if (w !== seen.at(-1)) seen.push(w)
    expect(await page.locator('.cell.md .cm-editor').count()).toBe(0)
  }
  expect(seen).toEqual([
    'goal:title',
    '__init__.py:441 pipeline():title',
    '__init__.py:441 pipeline():body',
    '#2:title',
    '__init__.py:743 resolve task:title',
    '__init__.py:743 resolve task:body',
    '#4:title'
  ])
  const back: string[] = [seen.at(-1)!]
  for (let k = 0; k < 120 && back.length < 4; k++) {
    await page.keyboard.press('ArrowUp')
    const w = await where(page)
    if (w !== back.at(-1)) back.push(w)
  }
  expect(back).toEqual([
    '#4:title',
    '__init__.py:743 resolve task:body',
    '__init__.py:743 resolve task:title',
    '#2:title'
  ])
})

test('pasted code loses its common indentation; a filename title picks the language (kills: filter / regex)', async ({
  launch
}) => {
  const { app, page } = await launch()
  const last = await recordPushes(app)
  await app.evaluate(({ clipboard }) =>
    clipboard.writeText('        if x:\n            y()\n        z()')
  )
  await page.locator('.cm-content').first().click()
  await page.keyboard.press('Meta+V')
  await expect.poll(async () => parseDoc((await last())!).cells[0].body).toBe('if x:\n    y()\nz()')
  await page.locator('.title').first().click()
  await page.keyboard.type('x.rs:1')
  await expect(page.locator('input.lang').first()).toHaveValue('Rust')
})

test('⋯ → Delete with indented below removes exactly that subtree (kills: popup op routing)', async ({
  launch
}) => {
  const { app, page } = await launch([FIXTURE])
  await app.evaluate(({ Menu }) => {
    Menu.prototype.popup = function () {
      this.getMenuItemById('removeIndented')!.click()
    }
  })
  await (await cellTitled(page, '__init__.py:743 resolve task')).locator('.more').click()
  await expect(page.locator('.cell')).toHaveCount(17)
  // The keyboard lands on the cell just above the deleted one (an untitled markdown note).
  await expect.poll(() => where(page)).toBe('#2:title')
  expect(
    await page.$$eval('.cell .title', (t) => t.map((e) => (e as HTMLInputElement).value))
  ).not.toContain('__init__.py:131 SUPPORTED_TASKS')
})
