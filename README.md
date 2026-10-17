# Walkthrough

A desktop app for tracing a codebase by hand. Paste code into cells, write notes
between them, and indent to follow a call. Black, blocky, 88 columns, no wasted pixels.

```
npm install
npm run dev     # run the app
npm test        # build + the whole suite (unit + e2e against the real app)
```

Test artifacts: `playwright-report/` (HTML), and a `trace.zip` per e2e test in
`test-results/` (`npx playwright show-trace <zip>`).
