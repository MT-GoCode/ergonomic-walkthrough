import { writeFileSync } from 'fs'
import { newCell, serializeDoc } from '../../src/shared/doc'
import { expect, test } from './app'

// Opening 300 cells × 60 lines (18k lines) is gated on Chromium's work counters, which
// are identical run to run and immune to machine load (wall and CPU time are not on
// Apple Silicon). Measured 2026-10-17; any increase is a regression, a decrease a new floor.
const BUDGET = { RecalcStyleCount: 1505, LayoutCount: 904, elements: 53890 }

test('opening a 300-cell, 18k-line trace does no more style, layout or DOM work than measured', async ({
  launch
}, info) => {
  const line = '    model_outputs = self.preprocess(inputs, **preprocess_params)  # noted\n'
  const cells = Array.from({ length: 300 }, (_, i) => ({
    ...newCell('code', i % 2, 'Python'),
    title: `cell ${i}`,
    body: line.repeat(60)
  }))
  const path = info.outputPath('big.walkthrough')
  writeFileSync(path, serializeDoc(cells))
  const { page } = await launch([path])
  await expect(page.locator('.cm-content')).toHaveCount(300)
  // Counters start at Performance.enable, so measure a full reload of the same document.
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  const t0 = Date.now()
  await page.reload()
  await expect(page.locator('.cm-content')).toHaveCount(300)
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  )
  const ms = Date.now() - t0
  const m = Object.fromEntries(
    (await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value])
  )
  const used = {
    RecalcStyleCount: m.RecalcStyleCount,
    LayoutCount: m.LayoutCount,
    elements: await page.evaluate(() => document.getElementsByTagName('*').length)
  }
  info.annotations.push({ type: 'perf', description: `${JSON.stringify(used)} in ${ms}ms wall` })
  expect(used.RecalcStyleCount).toBeLessThanOrEqual(BUDGET.RecalcStyleCount)
  expect(used.LayoutCount).toBeLessThanOrEqual(BUDGET.LayoutCount)
  expect(used.elements).toBeLessThanOrEqual(BUDGET.elements)
})
