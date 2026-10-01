/**
 * Team calendar feed: GET /calendar/<teamId>.ics
 *
 * Phones subscribe to this URL (see src/lib/calendarLinks.ts) and re-fetch it,
 * so schedule changes in TeamLinkt reach players' calendars on their own.
 * Cached at the edge for 15 minutes to keep TeamLinkt load down.
 */

import { EVENTS_API } from '../../src/lib/seasonConfig';
import { buildTeamCalendar, type EventRow } from '../../src/lib/teamCalendar';

async function fetchTeamRows(teamId: number, extra: Record<string, string>): Promise<EventRow[]> {
  const body = new URLSearchParams({ start: '0', length: '200', team_id: String(teamId), ...extra });
  // TeamLinkt answers 403 to the Workers runtime's default request; the
  // registration function hits the same wall and sends a User-Agent too.
  const res = await fetch(EVENTS_API, { method: 'POST', body, headers: { 'User-Agent': 'MattsVolleyball/1.0' } });
  if (!res.ok) throw new Error(`TeamLinkt ${res.status}`);
  const json = (await res.json()) as { data?: EventRow[] };
  return json.data ?? [];
}

export const onRequestGet: PagesFunction = async ({ params, request }) => {
  const teamId = Number(String(params.team ?? '').replace(/\.ics$/i, ''));
  if (!Number.isInteger(teamId) || teamId <= 0) {
    return new Response('Not found', { status: 404 });
  }

  try {
    // Past games stay on the calendar after they're played.
    const [upcoming, past] = await Promise.all([
      fetchTeamRows(teamId, { status: 'upcoming' }),
      fetchTeamRows(teamId, { status: 'past' }),
    ]);
    const site = new URL(request.url).origin;
    return new Response(buildTeamCalendar(teamId, [...past, ...upcoming], site), {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `inline; filename="team-${teamId}.ics"`,
        'Cache-Control': 'public, max-age=900, s-maxage=900',
      },
    });
  } catch (error) {
    // A 5xx makes calendar apps keep the events they already have.
    console.error('Error building team calendar:', error);
    return new Response('Calendar temporarily unavailable', { status: 503 });
  }
};
