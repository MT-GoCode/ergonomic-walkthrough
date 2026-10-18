import { writeFileSync } from 'fs'
import type { TestInfo } from '@playwright/test'
import { newCell, serializeDoc } from '../../src/shared/doc'
import { expect, test } from './app'

type Counts = { RecalcStyleCount: number; LayoutCount: number; elements: number }

// Opening a trace is gated on the work each extra cell adds: Chromium's counters for 300
// cells minus those for 150, per cell. Counters are exact, and the difference cancels the
// fixed per-machine overhead (window, display), which differs between a laptop and CI.
// Budget measured 2026-10-17 on mac-work-2; any increase is a regression, a decrease a new floor.
const BUDGET_PER_CELL: Counts = { RecalcStyleCount: 5, LayoutCount: 3, elements: 177.5 }

async function open(
  launch: Parameters<Parameters<typeof test>[2]>[0]['launch'],
  info: TestInfo,
  n: number
): Promise<Counts> {
  const line = '    model_outputs = self.preprocess(inputs, **preprocess_params)  # noted\n'
  const cells = Array.from({ length: n }, (_, i) => ({
    ...newCell('code', i % 2, 'Python'),
    title: `cell ${i}`,
    body: line.repeat(60)
  }))
  const path = info.outputPath(`trace-${n}.walkthrough`)
  writeFileSync(path, serializeDoc(cells))
  const { page } = await launch([path])
  await expect(page.locator('.cm-content')).toHaveCount(n)
  // Counters start at Performance.enable, so measure a full reload of the same document.
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  await page.reload()
  await expect(page.locator('.cm-content')).toHaveCount(n)
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  )
  const m = Object.fromEntries(
    (await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value])
  )
  return {
    RecalcStyleCount: m.RecalcStyleCount,
    LayoutCount: m.LayoutCount,
    elements: await page.evaluate(() => document.getElementsByTagName('*').length)
  }
}

test('each extra cell in a large trace costs no more style, layout or DOM work than measured', async ({
  launch
}, info) => {
  const [small, large] = [await open(launch, info, 150), await open(launch, info, 300)]
  const perCell = Object.fromEntries(
    (Object.keys(small) as (keyof Counts)[]).map((k) => [k, (large[k] - small[k]) / 150])
  ) as Counts
  info.annotations.push({ type: 'perf', description: JSON.stringify({ small, large, perCell }) })
  for (const k of Object.keys(perCell) as (keyof Counts)[])
    expect(perCell[k], k).toBeLessThanOrEqual(BUDGET_PER_CELL[k])
})
