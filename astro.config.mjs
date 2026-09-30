import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://mattsvolleyball.com',
  output: 'static',
  redirects: {
    '/home/': '/',
  },
  integrations: [
    tailwind(),
    sitemap({
      filter: (page) => {
        const excludes = ['/leagues/schedule', '/leagues/teams', '/leagues/team/', '/leagues/standings', '/leagues/scores', '/leagues/playoffs', '/image-gallery', '/home', '/register', '/404'];
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
  vite: {
    // Pins the date-driven season switches in src/lib/seasonConfig.ts to the
    // build, in the server render and the browser bundle alike.
    define: {
      __BUILD_TIME__: JSON.stringify(Date.now()),
    },
  },
});
