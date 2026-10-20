import { writeFileSync } from 'fs'
import { newCell, serializeDoc, type Cell } from '../../src/shared/doc'
import { click, expect, recordPushes, test, winId } from './app'

const cell = (depth: number, title: string, body: string, collapsed = false): Cell => ({
  ...newCell('code', depth, 'Python'),
  title,
  body,
  collapsed
})

// The first match sits two collapsed levels down; the second is a visible top-level cell.
const CELLS = [
  cell(0, 'start', 'nothing here'),
  cell(0, 'outer', 'x = 0', true),
  cell(1, 'mid', 'y = 0', true),
  cell(2, 'deep', 'z = 1\nfound_NEEDLE_here = 2'),
  cell(0, 'after', 'needle tail')
]

test('⇧⌘F finds text inside collapsed cells, opens only the path to the current match, and never edits the document (kills: searching only the rendered DOM; peeks left open; peek written into the file)', async ({
  launch
}, info) => {
  const path = info.outputPath('find.walkthrough')
  writeFileSync(path, serializeDoc(CELLS))
  const { app, page } = await launch([path])
  const lastPush = await recordPushes(app)
  const deep = page.locator(`.cell[data-id="${CELLS[3].id}"]`)
  const find = page.locator('.find input')
  const count = page.locator('.find .count')

  await click(app, 'find', await winId(app, page))
  await find.fill('needle')
  await expect(count).toHaveText('1 of 2')
  await expect(deep).toBeVisible()
  await expect(find).toBeFocused()

  await find.press('Enter')
  await expect(count).toHaveText('2 of 2')
  await expect(deep).toHaveCount(0)

  await find.press('Shift+Enter')
  await expect(count).toHaveText('1 of 2')
  await expect(deep).toBeVisible()

  // Esc hands the keyboard to the match, selected in its editor.
  await find.press('Escape')
  await expect(page.locator('.find')).toHaveCount(0)
  await expect(deep.locator('.cm-content')).toBeFocused()
  expect(await page.evaluate(() => getSelection()!.toString())).toBe('NEEDLE')

  // Peeking is view-only: the document was never changed.
  expect(await lastPush()).toBeUndefined()
})

test('a query with no match says so and moves nothing (kills: Enter on an empty result)', async ({
  launch
}, info) => {
  const path = info.outputPath('none.walkthrough')
  writeFileSync(path, serializeDoc(CELLS))
  const { app, page } = await launch([path])
  await click(app, 'find', await winId(app, page))
  const find = page.locator('.find input')
  await find.fill('absent_word')
  await find.press('Enter')
  await expect(page.locator('.find .count')).toHaveText('No results')
  await expect(page.locator('.cell')).toHaveCount(3)
})
