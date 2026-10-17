import { writeFileSync } from 'fs'
import { serializeDoc, newCell } from '../../src/shared/doc'
import { expect, test } from './app'

// 300 cells × 60 lines (18k lines). Budget = slowest of 5 isolated runs on mac-work-2
// (1807 ms, launch included) + their spread (59 ms), measured 2026-10-16.
const BUDGET_MS = 1807 + 59
test('a 300-cell, 18k-line trace opens and paints every editor', async ({ launch }, info) => {
  const line = '    model_outputs = self.preprocess(inputs, **preprocess_params)  # noted\n'
  const cells = Array.from({ length: 300 }, (_, i) => ({
    ...newCell('code', i % 2, 'Python'),
    title: `cell ${i}`,
    body: line.repeat(60)
  }))
  const path = info.outputPath('big.walkthrough')
  writeFileSync(path, serializeDoc(cells))
  const t0 = Date.now()
  const { page } = await launch([path])
  await expect(page.locator('.cm-content')).toHaveCount(300)
  const ms = Date.now() - t0
  console.log(`PERF open-300x60 ${ms}ms`)
  info.annotations.push({ type: 'perf', description: `open-300x60 ${ms}ms` })
  expect(ms).toBeLessThanOrEqual(BUDGET_MS)
})
