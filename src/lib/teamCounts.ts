import { UPCOMING_DIVISIONS, UPCOMING_SEASON_ID, UPCOMING_TEAMS_API_URL } from './seasonConfig';

/**
 * Live team counts for the upcoming season, keyed by division id.
 * Divisions that fail to fetch are omitted.
 */
export async function fetchUpcomingTeamCountsByDivision(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  await Promise.all(
    UPCOMING_DIVISIONS.map(async (div) => {
      const body = new URLSearchParams();
      body.set('group_ids[division]', div.id);
      body.set('season_id', UPCOMING_SEASON_ID);
      const res = await fetch(UPCOMING_TEAMS_API_URL, { method: 'POST', body });
      if (!res.ok) return;
      const teams: unknown = await res.json();
      counts[div.id] = Array.isArray(teams) ? teams.length : 0;
    })
  );
  return counts;
}
