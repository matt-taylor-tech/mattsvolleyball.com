/**
 * Site banner: GET /api/site-status (?test=1 for the Bot Test Group's banner)
 *
 * Returns the current status set from GroupMe (functions/api/groupme/[secret].ts),
 * or {"status": null}. Entries expire on their own at 4 AM Eastern.
 */

import { STATUS_KEY, TEST_STATUS_KEY } from '../../src/lib/bot/siteStatus';

interface Env {
  MV_STATE?: { get(key: string): Promise<string | null> };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const test = new URL(request.url).searchParams.get('test') === '1';
  let status: unknown = null;
  try {
    const raw = await env.MV_STATE?.get(test ? TEST_STATUS_KEY : STATUS_KEY);
    status = raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error('Error reading site status:', error);
  }
  return Response.json(
    { status },
    // Short cache: a rainout call should reach the site within a minute.
    { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } },
  );
};
