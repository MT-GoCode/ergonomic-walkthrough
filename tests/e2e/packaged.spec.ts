import { execFileSync } from 'child_process'
import { copyFileSync, existsSync, readdirSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { expect, FIXTURE, test } from './app'

// Only a packaged app declares .walkthrough (CFBundleDocumentTypes), so only it can be
// reached through LaunchServices or appear in Open Recent.
test.skip(!process.env.WT_EXECUTABLE, 'needs WT_EXECUTABLE (a packaged Walkthrough.app)')

const RECENTS = join(
  homedir(),
  'Library/Application Support/com.apple.sharedfilelist/com.apple.LSSharedFileList.ApplicationRecentDocuments'
)

test('a .walkthrough opened through LaunchServices opens in the running app and lands in Open Recent', async ({
  launch
}, info) => {
  const path = info.outputPath('finder-open.walkthrough')
  copyFileSync(FIXTURE, path)
  const { app } = await launch()
  await Promise.all([
    app.waitForEvent('window'),
    execFileSync('open', ['-b', 'com.mtgocode.walkthrough', path])
  ])
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => w.getTitle()))
    )
    .toContain('finder-open.walkthrough')
  // macOS writes the recents list asynchronously; it names the file in its bookmark data.
  const list = () =>
    readdirSync(RECENTS)
      .filter((f) => f.startsWith('com.mtgocode.walkthrough.sfl'))
      .map((f) => readFileSync(join(RECENTS, f)).includes('finder-open.walkthrough'))
  await expect.poll(list, { timeout: 15000 }).toContain(true)
  await app.evaluate(({ app }) => app.clearRecentDocuments())
  expect(existsSync(RECENTS)).toBe(true)
})
