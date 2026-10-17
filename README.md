# Walkthrough

A desktop app for tracing a codebase by hand. Paste code into cells, write notes
between them, and indent to follow a call. Black, blocky, 88 columns, no wasted pixels.

```
npm install
npm run dev     # run the app
npm test        # build + the whole suite (unit + e2e against the real app)
scripts/install.sh   # package and install to ~/Applications (registers .walkthrough)
scripts/mutants.sh   # prove the tests: every mutant must turn the suite red
```

Autosaves and the session live in `~/Library/Application Support/Walkthrough/`.
`WT_EXECUTABLE=<app>/Contents/MacOS/Walkthrough npx playwright test --project=e2e` runs
the e2e suite against a packaged app (CI does both).

Test artifacts: `playwright-report/` (HTML), and a `trace.zip` per e2e test in
`test-results/` (`npx playwright show-trace <zip>`).
