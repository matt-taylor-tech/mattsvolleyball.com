/**
 * Lists every champion in R2 and writes a JSON snapshot to
 * src/data/champions.fallback.json. The site reads that file when R2 is
 * unavailable or returns 0 results at build time, so committing this file
 * after photo uploads keeps the Champions page populated through R2 hiccups.
 *
 * The champion wizard (npm run champions) runs this automatically after each
 * upload; run it by hand after changing R2 any other way.
 *
 * Usage:
 *   node scripts/sync-champions-cache.mjs
 *
 * Requires .env with R2 credentials.
 */

import { createR2, listChampions, writeFallback, FALLBACK_PATH } from './lib/champions-r2.mjs';

const champions = await listChampions(createR2());
writeFallback(champions);
console.log(`Wrote ${champions.length} champions to ${FALLBACK_PATH}.`);
console.log('Commit this file so the site can survive R2 hiccups at build time.');
