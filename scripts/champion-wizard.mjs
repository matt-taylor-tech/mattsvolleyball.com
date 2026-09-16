/**
 * Champion photo wizard: a local page for adding champion photos to R2.
 *
 * Pick a team (from the seasons in src/lib/seasonConfig.ts and TeamLinkt
 * standings), drag a square crop, and upload. The wizard names the file,
 * crops and compresses it, uploads it to R2, and refreshes
 * src/data/champions.fallback.json. Commit that file afterwards.
 *
 * Usage:
 *   npm run champions            (or: node scripts/champion-wizard.mjs [--port 4321] [--no-open])
 *
 * Requires .env with R2 credentials. Optional: CLOUDFLARE_DEPLOY_HOOK_URL
 * enables the "Rebuild site now" button.
 */

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSeasons, fetchStandings, fetchTeamsFromGames, PLACEHOLDER_TEAMS } from './lib/mv.mjs';
import {
  REPO_ROOT, createR2, listChampions, writeFallback, objectExists, uploadChampion,
  processImage, buildKey, SEASON_DISPLAY,
} from './lib/champions-r2.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGE_PATH = path.join(__dirname, 'champion-wizard', 'index.html');
const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;

const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const PORT = portArg >= 0 ? Number(args[portArg + 1]) : 4390;
const openBrowser = !args.includes('--no-open');

const r2 = createR2();
const publicBase = (r2.env.PUBLIC_R2_BASE_URL ?? '').replace(/\/+$/, '');
const deployHook = r2.env.CLOUDFLARE_DEPLOY_HOOK_URL ?? '';

const DAY_NAMES = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };

/** Best guess at the R2 season slug from a TeamLinkt label like "Summer Redux 2026". */
function guessSeason(label) {
  const l = label.toLowerCase();
  if (/spring/.test(l)) return 'spring';
  if (/fall|autumn/.test(l)) return 'fall';
  if (/winter/.test(l)) return 'winter';
  if (/redux|late summer|summer ii\b|summer 2\b/.test(l)) return 'summer-ii';
  if (/summer/.test(l)) return 'summer-i';
  return '';
}

function publicUrl(key) {
  // The site serves R2 objects under PUBLIC_R2_BASE_URL minus the "mattsvolleyball/" prefix.
  const photo = key.replace(/^mattsvolleyball\//, '/');
  return publicBase ? `${publicBase}${photo}` : '';
}

/**
 * Seasons that used to be CURRENT_SEASON, read from the git history of
 * seasonConfig.ts, newest first. Lets you add photos for a season that has
 * already rolled off the config.
 */
async function loadPastSeasons(skipIds) {
  const git = (...a) => execFileSync('git', a, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const seen = new Set(skipIds);
  const past = [];
  let commits = [];
  try {
    commits = git('log', '--format=%H', '--', 'src/lib/seasonConfig.ts').split(/\r?\n/).filter(Boolean);
  } catch (err) {
    console.warn(`Could not read git history for past seasons: ${err.message}`);
    return past;
  }
  for (const commit of commits) {
    let source;
    try {
      source = git('show', `${commit}:src/lib/seasonConfig.ts`);
    } catch {
      continue;
    }
    const current = (await loadSeasons(source)).find((s) => s.which === 'current');
    if (!current || seen.has(current.id) || current.divisions.length === 0) continue;
    seen.add(current.id);
    past.push({ ...current, which: 'past' });
  }
  return past;
}

async function buildContext() {
  const configured = await loadSeasons();
  const seasons = [...configured, ...(await loadPastSeasons(configured.map((s) => s.id)))];
  const out = [];
  for (const season of seasons) {
    const divisions = await Promise.all(season.divisions.map(async (d) => {
      let teams = [];
      let error = '';
      try {
        const standings = await fetchStandings(d.id, season.id);
        teams = standings.map((s) => s.name).filter((n) => n && !PLACEHOLDER_TEAMS.has(n));
        // Closed seasons return no standings; fall back to the teams in their games.
        if (teams.length === 0) teams = await fetchTeamsFromGames(d.id);
      } catch (err) {
        error = err.message;
      }
      return {
        id: d.id,
        label: `${DAY_NAMES[d.day] ?? d.day} ${d.name}`,
        day: DAY_NAMES[d.day] ?? d.day,
        division: d.name,
        teams,
        error,
      };
    }));
    const year = Number(season.label.match(/\b(20\d\d)\b/)?.[1]) || new Date().getFullYear();
    // Hide divisions with no teams (e.g. a canceled night), unless TeamLinkt failed:
    // then keep them so a team can still be typed in.
    const active = divisions.filter((d) => d.teams.length || d.error);
    out.push({
      which: season.which,
      id: season.id,
      label: season.label,
      year,
      season: guessSeason(season.label),
      divisions: active,
    });
  }
  return {
    seasons: out,
    seasonOptions: Object.entries(SEASON_DISPLAY).map(([value, label]) => ({ value, label })),
    canRebuild: Boolean(deployHook),
  };
}

// ── HTTP plumbing ────────────────────────────────────────────────────────────

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_UPLOAD_BYTES) throw Object.assign(new Error('File is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const body = await readBody(req);
  try {
    return JSON.parse(body.toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('Invalid JSON.'), { status: 400 });
  }
}

/** Only answer requests addressed to this machine (guards against DNS rebinding). */
function isLocalRequest(req) {
  const host = (req.headers.host ?? '').replace(/:\d+$/, '');
  return host === '127.0.0.1' || host === 'localhost';
}

const routes = {
  'GET /': async (req, res) => {
    send(res, 200, await readFile(PAGE_PATH), 'text/html; charset=utf-8');
  },

  'GET /api/context': async (req, res) => {
    send(res, 200, await buildContext());
  },

  'GET /api/champions': async (req, res) => {
    send(res, 200, { champions: await listChampions(r2) });
  },

  'POST /api/preview-key': async (req, res) => {
    const fields = await readJson(req);
    let key;
    try {
      key = buildKey(fields);
    } catch (err) {
      return send(res, 200, { key: '', error: err.message });
    }
    send(res, 200, { key, exists: await objectExists(r2, key) });
  },

  'POST /api/upload': async (req, res, url) => {
    let meta;
    try {
      meta = JSON.parse(url.searchParams.get('meta') ?? '{}');
    } catch {
      return send(res, 400, { error: 'Invalid upload details.' });
    }
    let key;
    try {
      key = buildKey(meta);
    } catch (err) {
      return send(res, 400, { error: err.message });
    }

    const original = await readBody(req);
    if (!original.length) return send(res, 400, { error: 'No image received.' });

    let processed;
    try {
      processed = await processImage(original, meta.crop);
    } catch (err) {
      return send(res, 400, { error: `Could not read that image: ${err.message}` });
    }

    const replaced = await objectExists(r2, key);
    await uploadChampion(r2, key, processed);

    const champions = await listChampions(r2);
    writeFallback(champions);

    console.log(`${replaced ? 'Replaced' : 'Uploaded'} ${key} (${Math.round(processed.length / 1024)} KB)`);
    send(res, 200, {
      key,
      replaced,
      url: publicUrl(key),
      originalBytes: original.length,
      bytes: processed.length,
      championCount: champions.length,
    });
  },

  'POST /api/rebuild': async (req, res) => {
    if (!deployHook) return send(res, 400, { error: 'CLOUDFLARE_DEPLOY_HOOK_URL is not set in .env.' });
    const r = await fetch(deployHook, { method: 'POST' });
    if (!r.ok) return send(res, 502, { error: `Cloudflare replied with HTTP ${r.status}.` });
    console.log('Requested a Cloudflare Pages rebuild.');
    send(res, 200, { ok: true });
  },
};

const server = http.createServer(async (req, res) => {
  if (!isLocalRequest(req)) return send(res, 403, { error: 'Local requests only.' });
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const handler = routes[`${req.method} ${url.pathname}`];
  if (!handler) return send(res, 404, { error: 'Not found.' });
  try {
    await handler(req, res, url);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) send(res, err.status ?? 500, { error: err.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const address = `http://127.0.0.1:${PORT}/`;
  console.log(`Champion wizard running at ${address}`);
  console.log('Press Ctrl+C to stop.');
  if (!openBrowser) return;
  const [cmd, cmdArgs] = process.platform === 'win32'
    ? ['cmd', ['/c', 'start', '', address]]
    : [process.platform === 'darwin' ? 'open' : 'xdg-open', [address]];
  spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true }).unref();
});
