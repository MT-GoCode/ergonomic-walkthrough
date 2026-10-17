import { defineConfig } from '@playwright/test'

export default defineConfig({
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  projects: [
    { name: 'unit', testDir: 'tests/unit' },
    { name: 'e2e', testDir: 'tests/e2e', testIgnore: '**/perf.spec.ts' },
    // Timed alone, after everything else, so parallel tests never skew the number.
    {
      name: 'perf',
      testDir: 'tests/e2e',
      testMatch: '**/perf.spec.ts',
      dependencies: ['unit', 'e2e']
    }
  ]
})
