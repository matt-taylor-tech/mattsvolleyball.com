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
        const excludes = ['/leagues/schedule', '/leagues/teams', '/leagues/standings', '/leagues/scores', '/home'];
        return !page.includes('_') && !excludes.some((p) => page.includes(p));
      },
    }),
  ],
  build: {
    assets: '_assets',
  },
});
