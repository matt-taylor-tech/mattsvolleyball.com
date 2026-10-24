import { defineConfig, devices } from '@playwright/test';

// Visual regression tests for the main pages at phone and desktop width.
// See tests/visual/pages.spec.mjs for how baselines are made and compared.
const PORT = 4322;

export default defineConfig({
  testDir: 'tests/visual',
  outputDir: 'tests/visual/.results',
  globalSetup: './tests/visual/global-setup.mjs',
  // One baseline folder for every project, named by project and page.
  snapshotPathTemplate: 'tests/visual/.baseline/{projectName}/{arg}{ext}',
  fullyParallel: true,
  reporter: [['list'], ['html', { outputFolder: 'tests/visual/.report', open: 'never' }]],
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      // Absorbs anti-aliasing noise, not layout changes.
      maxDiffPixelRatio: 0.002,
    },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    timezoneId: 'America/New_York',
    locale: 'en-US',
  },
  projects: [
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 13'],
        // Chromium, not WebKit: only Chromium is installed for the
        // schedule-image script. 375px is the narrowest common phone.
        browserName: 'chromium',
        defaultBrowserType: 'chromium',
        viewport: { width: 375, height: 812 },
      },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    // Always build the checked-out code, never test a server left running
    // from another branch.
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
