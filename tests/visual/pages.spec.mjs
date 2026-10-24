import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { BASELINE_DIR, META_FILE } from './paths.mjs';

// Phone-width and desktop screenshots of the main pages (issue #54).
//
// Baselines are local and git-ignored: the pages change on their own (the
// nightly build re-reads TeamLinkt registration and switches seasons by date,
// and scores come in all week), so committed screenshots would go stale. The
// workflow is before/after instead:
//
//   npm run test:visual:baseline   on main, before a change
//   npm run test:visual            on your branch, after it
//
// The baseline run records every TeamLinkt API response to a HAR file and the
// time it ran; the compare run replays those responses with the clock frozen
// at that time, so only your change can move a pixel.

const PAGES = [
  { name: 'home', path: '/' },
  { name: 'leagues', path: '/leagues/' },
  { name: 'schedule', path: '/leagues/schedule/' },
  { name: 'standings', path: '/leagues/standings/' },
  { name: 'rules', path: '/rules/' },
];

const API = /^https:\/\/app\.mattsvolleyball\.com\//;

function baselineTime() {
  try {
    return JSON.parse(readFileSync(META_FILE, 'utf8')).time;
  } catch {
    throw new Error('No visual baseline yet. Run `npm run test:visual:baseline` first (on main, before your change).');
  }
}

for (const { name, path } of PAGES) {
  test(name, async ({ page }, testInfo) => {
    const recording = testInfo.config.updateSnapshots === 'all';
    await page.clock.setFixedTime(baselineTime());
    await page.routeFromHAR(`${BASELINE_DIR}/${testInfo.project.name}/${name}.har`, {
      url: API,
      update: recording,
      updateContent: 'embed',
    });
    // `astro preview` doesn't run the caching proxy (functions/api/teamlinkt),
    // so send its requests on to TeamLinkt, where the HAR records and replays them.
    await page.route('**/api/teamlinkt/**', (route) => {
      const path = new URL(route.request().url()).pathname.replace('/api/teamlinkt/', '');
      return route.fallback({ url: `https://app.mattsvolleyball.com/leagues/${path}` });
    });

    await page.goto(path, { waitUntil: 'networkidle' });
    // Load the lazy images (champion photos) now, so a full-page shot never
    // catches them half-loaded.
    await page.evaluate(async () => {
      const images = [...document.images];
      for (const img of images) img.loading = 'eager';
      await Promise.all(images.map((img) => img.decode().catch(() => {})));
      await document.fonts.ready;
    });

    // Nothing wider than the screen: the most common phone layout bug, and
    // one a screenshot of the visible width would not show.
    const overflow = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth <= width) return [];
      // Fixed bars (the bottom nav) stretch to the overflow; they're not the cause.
      const inFixed = (el) => {
        for (; el; el = el.parentElement) if (getComputedStyle(el).position === 'fixed') return true;
        return false;
      };
      return [...document.querySelectorAll('body *')]
        .filter((el) => el.getBoundingClientRect().right > width + 1 && !inFixed(el))
        .slice(0, 10)
        .map((el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${[...el.classList].join('.')}`);
    });
    expect(overflow, 'elements wider than the viewport').toEqual([]);

    await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true });
  });
}
