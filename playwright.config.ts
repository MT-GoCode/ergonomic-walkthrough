import { defineConfig } from '@playwright/test'

export default defineConfig({
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  projects: [
    { name: 'unit', testDir: 'tests/unit' },
    { name: 'e2e', testDir: 'tests/e2e', testIgnore: '**/perf.spec.ts' },
    // Work counters drift when other tests compete for the CPU, so perf runs alone, last.
    {
      name: 'perf',
      testDir: 'tests/e2e',
      testMatch: '**/perf.spec.ts',
      dependencies: ['unit', 'e2e']
    }
  ]
})
