import { writeFileSync } from 'fs'
import type { Page } from '@playwright/test'
import { newCell, serializeDoc } from '../../src/shared/doc'
import { chPx, expect, test } from './app'

// A dive 8 levels deep and back out, each cell 30 lines tall.
const DEPTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 0]

async function open(launch: Parameters<Parameters<typeof test>[2]>[0]['launch'], path: string) {
  const cells = DEPTHS.map((d, i) => ({
    ...newCell('code', d, 'Python'),
    title: `d${d}-${i}`,
    body: Array.from({ length: 30 }, (_, k) => `line_${k} = ${k}`).join('\n')
  }))
  writeFileSync(path, serializeDoc(cells))
  const { app, page } = await launch([path])
  const ch = await chPx(page)
  // 100 characters of window: a depth-8 cell (24 + 88 + padding) cannot fit unshifted.
  await app.evaluate(
    ({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0].setContentSize(w, 700),
    Math.round(100 * ch)
  )
  await page.waitForFunction(
    (w) => document.querySelector('.scroller')!.clientWidth <= w,
    Math.round(100 * ch)
  )
  return { app, page }
}

const offset = (page: Page) =>
  page.$eval('.track', (t) =>
    Math.abs(parseFloat(/translateX\((-?[\d.]+)px\)/.exec((t as HTMLElement).style.transform)![1]))
  )

// Wait for the slide to settle, then report where cell k sits relative to the window and the clip box.
const settle = async (page: Page, k: number) => {
  let prev = NaN
  for (;;) {
    await page.waitForTimeout(160) // > the 125ms transition
    const o = await offset(page)
    if (o === prev) break
    prev = o
  }
  return page.evaluate((k) => {
    const r = document.querySelectorAll<HTMLElement>('.cell')[k].getBoundingClientRect()
    // .clip is the only box that can cut a cell off; the cell must lie inside it.
    const clip = document.querySelector<HTMLElement>('.clip')!.getBoundingClientRect()
    const sc = document.querySelector<HTMLElement>('.scroller')!
    return {
      top: r.top,
      line: sc.getBoundingClientRect().top + 0.1 * sc.clientHeight,
      left: r.left,
      right: r.right,
      width: sc.clientWidth,
      inClip: r.left >= clip.left - 0.5 && r.right <= clip.right + 0.5,
      scrollLeft: sc.scrollLeft + document.scrollingElement!.scrollLeft
    }
  }, k)
}

// Put cell k's top just above the 10% line (dy > 0 pushes the title further up, out of view).
const scrollCellTo = (page: Page, k: number, dy = 1) =>
  page.evaluate(
    ([k, dy]) => {
      const sc = document.querySelector<HTMLElement>('.scroller')!
      const cell = document.querySelectorAll<HTMLElement>('.cell')[k]
      const line = sc.getBoundingClientRect().top + 0.1 * sc.clientHeight
      sc.scrollTop += cell.getBoundingClientRect().top - line + dy
    },
    [k, dy]
  )

test('the cell crossing the top 10% line is always fully readable; depth 0 never shifts (kills: offset/clip)', async ({
  launch
}, info) => {
  const { page } = await open(launch, info.outputPath('deep.walkthrough'))
  for (const k of [0, 3, 6, 8, 9, 7, 2]) {
    await scrollCellTo(page, k)
    const s = await settle(page, k)
    expect(s.top, `cell ${k} reached the anchor line`).toBeLessThanOrEqual(s.line)
    expect(s.left, `cell ${k}`).toBeGreaterThanOrEqual(-0.5)
    expect(s.right, `cell ${k}`).toBeLessThanOrEqual(s.width + 0.5)
    expect(s.inClip, `cell ${k} is not clipped`).toBe(true)
    expect(s.scrollLeft).toBe(0)
    if (DEPTHS[k] === 0) expect(await offset(page)).toBe(0)
  }
})

test('scrolling up into a tall cell whose title is off-screen anchors that cell (kills: title-only detection)', async ({
  launch
}, info) => {
  const { page } = await open(launch, info.outputPath('deep.walkthrough'))
  await scrollCellTo(page, 2)
  await settle(page, 2)
  await scrollCellTo(page, 8, 200) // title of the depth-8 cell is 200px above the line, out of view
  const s = await settle(page, 8)
  expect(s.right).toBeLessThanOrEqual(s.width + 0.5)
  expect(s.inClip).toBe(true)
})

test('focus pins the anchor: keyboard into a deep cell, typing that scrolls, and wheels never scroll sideways', async ({
  launch
}, info) => {
  const { page } = await open(launch, info.outputPath('deep.walkthrough'))
  await page.locator('.title').nth(7).click()
  await page.keyboard.press('ArrowDown') // into d7's body
  for (let k = 0; k < 40; k++) await page.keyboard.press('ArrowDown') // through d7, onto d8's title
  const s = await settle(page, 8)
  expect(s.right).toBeLessThanOrEqual(s.width + 0.5)
  expect(s.scrollLeft).toBe(0)
  const pinned = await offset(page)
  await page.keyboard.press('Enter')
  await page.keyboard.press('End')
  for (let k = 0; k < 40; k++) await page.keyboard.press('Enter') // CodeMirror scrolls the cursor into view
  expect((await settle(page, 8)).scrollLeft).toBe(0)
  expect(await offset(page)).toBe(pinned)
  await page.mouse.move(200, 300)
  await page.mouse.wheel(600, 0)
  expect((await settle(page, 8)).scrollLeft).toBe(0)
})
