// TeamLinkt reads for the GroupMe bot. Runs in a Pages Function, so no DOM.

import {
  EVENTS_API, activeSeasonAt,
  UPCOMING_DIVISIONS, UPCOMING_MAX_TEAMS_BY_NIGHT, UPCOMING_PLAYER_CAPS_BY_DIVISION,
} from '../seasonConfig';

// Season values are looked up per call with activeSeasonAt(new Date()): the
// module-level ACTIVE_* constants read the clock at load time, which in a
// Worker is 1970.
import { fetchUpcomingTeamCountsByDivision, fetchUpcomingPlayerCountsByDivision } from '../teamCounts';
import { cellText } from '../teamCalendar';

/** fetch with the User-Agent TeamLinkt requires from Workers (it 403s without one). */
export const tlFetch: typeof fetch = (input, init = {}) => {
  const headers = new Headers(init.headers);
  headers.set('User-Agent', 'MattsVolleyball/1.0');
  return fetch(input, { ...init, headers });
};

async function postForm<T>(url: string, params: Record<string, string>): Promise<T> {
  const res = await tlFetch(url, { method: 'POST', body: new URLSearchParams(params) });
  if (!res.ok) throw new Error(`TeamLinkt ${res.status} from ${url}`);
  return res.json() as Promise<T>;
}

type EventRow = Record<string, string | number>;

export interface NightGame {
  time: string; // '6:30 PM'
  court: string; // 'Court 1'
  home: string;
  away: string;
}

/**
 * Games on the next date `day` ('Tue', 'Thu', ...) has games, using
 * TeamLinkt's displayed Eastern date ('Thu Oct 1, 2026'). Its unix timestamp
 * runs hours off from the displayed time, so it's only used for ordering.
 */
export async function fetchNextNightGames(day: string): Promise<{ date: string; games: NightGame[] } | null> {
  const divisionIds = activeSeasonAt(new Date()).divisions.filter((d) => d.day === day).map((d) => d.id);
  const rows = (await Promise.all(divisionIds.map((id) =>
    postForm<{ data?: EventRow[] }>(EVENTS_API, {
      start: '0', length: '100', status: 'upcoming', [`filters[${id}]`]: id,
    }).then((j) => j.data ?? []),
  ))).flat().sort((a, b) => Number(a['6']) - Number(b['6']));
  if (rows.length === 0) return null;

  const date = String(rows[0]['0']);
  const games = rows
    .filter((r) => String(r['0']) === date)
    .map((r) => {
      const location = cellText(r['5']);
      return {
        time: String(r['1']).split(' - ')[0].trim(),
        court: location.match(/Court\s*\d+/i)?.[0] ?? location,
        home: cellText(r['3']),
        away: cellText(r['4']),
      };
    });
  return { date, games };
}

export interface StandingRow {
  rank: number;
  name: string;
  wins: number;
  losses: number;
}

/** One division's standings, ranked (mirrors fetchStandings in mv.mjs). */
export async function fetchDivisionStandings(divisionId: string): Promise<StandingRow[]> {
  const season = activeSeasonAt(new Date());
  const json = await postForm<{ standings?: Array<Record<string, any>> }>(season.standingsUrl, {
    'group_ids[division]': divisionId,
    season_id: season.seasonId,
  });
  return (json.standings ?? [])
    .map((s) => ({
      rank: s.ranking as number | null, // null until games are played
      name: s.Team?.name || cellText(s.team_name),
      wins: Number(s.total_wins) || 0,
      losses: Number(s.total_losses) || 0,
    }))
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
    .map((s, i) => ({ ...s, rank: s.rank ?? i + 1 }));
}

export function divisionsForDay(day?: string) {
  const { divisions } = activeSeasonAt(new Date());
  return day ? divisions.filter((d) => d.day === day) : divisions;
}

/** League nights in the active season ('Tue', 'Wed', 'Thu'). */
export function activeDays(): string[] {
  return activeSeasonAt(new Date()).days;
}

export interface SpotsLine {
  label: string;
  count: number;
  max: number;
  unit: 'teams' | 'players';
}

/** Signups against each cap for the upcoming season (same caps as the site's counters). */
export async function fetchSpots(): Promise<SpotsLine[]> {
  const [teams, players] = await Promise.all([
    fetchUpcomingTeamCountsByDivision(tlFetch),
    fetchUpcomingPlayerCountsByDivision(tlFetch),
  ]);
  const lines: SpotsLine[] = [];
  for (const [night, max] of Object.entries(UPCOMING_MAX_TEAMS_BY_NIGHT)) {
    const divs = UPCOMING_DIVISIONS.filter((d) => d.day === night);
    // Skip a night with a failed fetch rather than show an undercount.
    if (divs.length === 0 || divs.some((d) => teams[d.id] === undefined)) continue;
    lines.push({ label: night, count: divs.reduce((n, d) => n + (teams[d.id] ?? 0), 0), max, unit: 'teams' });
  }
  for (const [divId, max] of Object.entries(UPCOMING_PLAYER_CAPS_BY_DIVISION)) {
    const div = UPCOMING_DIVISIONS.find((d) => d.id === divId);
    if (div && players[divId] !== undefined) lines.push({ label: div.label, count: players[divId], max, unit: 'players' });
  }
  const order = ['Mon', 'Tue', 'Wed', 'Thu'];
  return lines.sort((a, b) => order.indexOf(a.label.slice(0, 3)) - order.indexOf(b.label.slice(0, 3)));
}
