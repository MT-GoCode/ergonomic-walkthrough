import { writeFileSync } from 'fs'
import type { Page } from '@playwright/test'
import { newCell, serializeDoc } from '../../src/shared/doc'
import { chPx, expect, test } from './app'

// A dive 8 levels deep and back out, each cell 30 lines tall.
const DEPTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 0]

async function open(
  launch: Parameters<Parameters<typeof test>[2]>[0]['launch'],
  path: string,
  cols = 100
) {
  const cells = DEPTHS.map((d, i) => ({
    ...newCell('code', d, 'Python'),
    title: `d${d}-${i}`,
    body: Array.from({ length: 30 }, (_, k) => `line_${k} = ${k}`).join('\n')
  }))
  writeFileSync(path, serializeDoc(cells))
  const { app, page } = await launch([path])
  // At 100 characters of window, cells from depth 2 on (6ch + 88ch + padding) stick out.
  const w = Math.round(cols * (await chPx(page)))
  await app.evaluate(
    ({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0].setContentSize(w, 700),
    w
  )
  await page.waitForFunction((w) => document.querySelector('.scroller')!.clientWidth <= w, w)
  return page
}

// Where cell k sits once the 125ms slide has settled, and whether anything scrolled natively.
const at = async (page: Page, k: number) => {
  await page.waitForTimeout(200)
  return page.evaluate((k) => {
    const r = document.querySelectorAll<HTMLElement>('.cell')[k].getBoundingClientRect()
    const sc = document.querySelector<HTMLElement>('.scroller')!
    return {
      left: r.left,
      right: r.right,
      width: sc.clientWidth,
      scrollLeft: sc.scrollLeft + document.scrollingElement!.scrollLeft
    }
  }, k)
}
const focusTitle = (page: Page, k: number) => page.locator('.title').nth(k).focus()

test('focusing a cell that sticks out puts its left edge at the window edge; one that fits moves nothing (kills: reveal)', async ({
  launch
}, info) => {
  const page = await open(launch, info.outputPath('deep.walkthrough'))
  await focusTitle(page, 1) // depth 1 fits: nothing moves
  expect((await at(page, 0)).left).toBeCloseTo(0, 0)
  await focusTitle(page, 8)
  const deep = await at(page, 8)
  expect(deep.left).toBeCloseTo(0, 0)
  expect(deep.scrollLeft).toBe(0)
  await focusTitle(page, 9) // depth 0, now off to the left: back to the window edge
  expect((await at(page, 9)).left).toBeCloseTo(0, 0)
})

test('vertical scrolling and wheels never move the canvas sideways (kills: scroll-driven anchoring)', async ({
  launch
}, info) => {
  const page = await open(launch, info.outputPath('deep.walkthrough'))
  await focusTitle(page, 0)
  await page.evaluate(() => (document.querySelector('.scroller')!.scrollTop = 10_000))
  expect((await at(page, 0)).left).toBeCloseTo(0, 0)
  await page.mouse.move(200, 300)
  await page.mouse.wheel(600, 0)
  const s = await at(page, 0)
  expect(s.left).toBeCloseTo(0, 0)
  expect(s.scrollLeft).toBe(0)
})

test('typing in a revealed cell keeps it put while CodeMirror scrolls (kills: native horizontal scroll)', async ({
  launch
}, info) => {
  const page = await open(launch, info.outputPath('deep.walkthrough'))
  await page.locator('.cm-content').nth(8).click()
  await page.keyboard.press('Meta+End')
  for (let k = 0; k < 40; k++) await page.keyboard.press('Enter')
  const s = await at(page, 8)
  expect(s.left).toBeCloseTo(0, 0)
  expect(s.scrollLeft).toBe(0)
})

test('in a window narrower than a cell, typing to the end of a line never scrolls the page sideways (kills: clip layer)', async ({
  launch
}, info) => {
  const page = await open(launch, info.outputPath('deep.walkthrough'), 60)
  await page.locator('.cm-content').first().click()
  await page.keyboard.press('Meta+End')
  await page.keyboard.insertText('x'.repeat(85))
  expect((await at(page, 0)).scrollLeft).toBe(0)
})
