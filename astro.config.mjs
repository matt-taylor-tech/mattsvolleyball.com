import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

// The R2 host champion photos are served from, so <Picture> in
// ChampionCard.astro can resize them. Cloudflare sets the variable in the
// build environment; locally it comes from .env.
function r2Host() {
  let base = process.env.PUBLIC_R2_BASE_URL;
  if (!base) {
    try {
      base = parseEnv(readFileSync('.env', 'utf8')).PUBLIC_R2_BASE_URL;
    } catch {
      // no .env
    }
  }
  try {
    return [new URL(base.trim()).hostname];
  } catch {
    return [];
  }
}

export default defineConfig({
  site: 'https://mattsvolleyball.com',
  output: 'static',
  redirects: {
    '/home/': '/',
  },
  integrations: [
    sitemap({
      filter: (page) => {
        const excludes = ['/leagues/schedule', '/leagues/teams', '/leagues/team/', '/leagues/standings', '/leagues/scores', '/leagues/playoffs', '/image-gallery', '/home', '/register', '/404', '/offline'];
        return !page.includes('_') && !excludes.some((p) => page.includes(p));
      },
      serialize: (item) => {
        item.lastmod = new Date();
        return item;
      },
    }),
  ],
  build: {
    assets: '_assets',
  },
  image: {
    domains: r2Host(),
  },
  // Keep spaces between inline elements. Astro 7's default ('jsx') strips
  // them, which runs words together around links and bold text.
  compressHTML: true,
  // Start loading a page before it's opened: on hover/focus by default, and
  // as soon as the mobile menu shows its links (see Header.astro). Astro skips
  // this on data-saver and very slow connections.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
  vite: {
    // Pins the date-driven season switches in src/lib/seasonConfig.ts to the
    // build, in the server render and the browser bundle alike.
    define: {
      __BUILD_TIME__: JSON.stringify(Date.now()),
    },
    // Vite 8 targets Safari 16.4+ by default: it writes breakpoints as
    // `@media (width>=640px)`, which older Safari ignores (so an older iPad
    // or Mac gets the phone layout), and lets newer JS syntax through. Keep
    // the targets Vite used before Astro 7.
    build: {
      target: ['edge88', 'firefox78', 'chrome87', 'safari14'],
    },
  },
});
