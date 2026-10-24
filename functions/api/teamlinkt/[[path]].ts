/**
 * TeamLinkt proxy: /api/teamlinkt/<endpoint>/...
 *
 * The league pages call TeamLinkt through here instead of directly, so every
 * visitor shares one cached copy per request (issue #46). Responses are fresh
 * for FRESH_SECONDS; after that the cached copy is still served while a
 * background request refreshes it, for up to STALE_SECONDS. Past that the
 * visitor waits for TeamLinkt, and if TeamLinkt is down they get the last good
 * copy (up to KEEP_SECONDS old) instead of an error.
 *
 * Only the endpoints the browser uses are forwarded, for this org only.
 * Server code (the bot, the calendar feed, the scripts) calls TeamLinkt
 * directly and never comes through here.
 */

import { TEAMLINKT_API_BASE } from '../../../src/lib/seasonConfig';

const FRESH_SECONDS = 120;
const STALE_SECONDS = 600;
const KEEP_SECONDS = 86_400;
const MAX_BODY_BYTES = 2048;

const ALLOWED_PATH = /^(getAllEvents\/10757|(getTeams|getStandings|getTeam)\/10757\/\d+)$/;
const STORED_AT = 'X-Stored-At';

export const onRequest: PagesFunction = async ({ request, params, waitUntil }) => {
  const path = (Array.isArray(params.path) ? params.path : [params.path]).join('/');
  if (!ALLOWED_PATH.test(path)) return new Response('Not found', { status: 404 });
  if (request.method !== 'GET' && request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const body = request.method === 'POST' ? await request.text() : '';
  if (body.length > MAX_BODY_BYTES) return new Response('Request too large', { status: 413 });

  // The Cache API only stores GETs, so POSTs are keyed by a hash of the body.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${request.method}\n${body}`));
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const cacheKey = new Request(`${new URL(request.url).origin}/api/teamlinkt/${path}?key=${hash}`);
  const cache = caches.default;

  const refresh = async (): Promise<Response> => {
    const upstream = await fetch(`${TEAMLINKT_API_BASE}/${path}`, {
      method: request.method,
      body: body || undefined,
      headers: {
        'Content-Type': request.headers.get('Content-Type') ?? 'application/x-www-form-urlencoded',
        // TeamLinkt rejects requests from Workers without one.
        'User-Agent': 'MattsVolleyball/1.0',
      },
    });
    if (!upstream.ok) throw new Error(`TeamLinkt returned ${upstream.status}`);
    const text = await upstream.text();
    await cache.put(cacheKey, new Response(text, {
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
        'Cache-Control': `public, max-age=${KEEP_SECONDS}`,
        [STORED_AT]: String(Date.now()),
      },
    }));
    return reply(text, upstream.headers.get('Content-Type'), 'MISS');
  };

  const cached = await cache.match(cacheKey);
  const age = cached ? (Date.now() - Number(cached.headers.get(STORED_AT))) / 1000 : Infinity;

  if (cached && age < FRESH_SECONDS) {
    return reply(await cached.text(), cached.headers.get('Content-Type'), 'HIT');
  }
  if (cached && age < FRESH_SECONDS + STALE_SECONDS) {
    waitUntil(refresh().catch((error) => console.error('TeamLinkt refresh failed:', error)));
    return reply(await cached.text(), cached.headers.get('Content-Type'), 'STALE');
  }
  try {
    return await refresh();
  } catch (error) {
    console.error('TeamLinkt request failed:', error);
    if (cached) return reply(await cached.text(), cached.headers.get('Content-Type'), 'STALE-ERROR');
    return Response.json({ error: 'TeamLinkt is unavailable' }, { status: 502 });
  }
};

function reply(text: string, contentType: string | null, cacheStatus: string): Response {
  return new Response(text, {
    headers: {
      'Content-Type': contentType ?? 'application/json',
      // The edge copy above is the shared cache; browsers always ask it.
      'Cache-Control': 'no-cache',
      'X-Cache': cacheStatus,
    },
  });
}
