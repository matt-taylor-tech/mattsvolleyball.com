import {
  UPCOMING_DIVISIONS,
  UPCOMING_PLAYER_CAPS_BY_DIVISION,
  UPCOMING_SEASON_ID,
  UPCOMING_TEAMS_API_URL,
} from './seasonConfig';

const API_BASE = 'https://app.mattsvolleyball.com/leagues';
const ORG_ID = '10757';

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

/**
 * Live player counts (sum of team_member_count across teams in the division)
 * for divisions configured in UPCOMING_PLAYER_CAPS_BY_DIVISION. Used by
 * shuffle-style leagues that track a roster cap rather than a team cap.
 */
export async function fetchUpcomingPlayerCountsByDivision(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const targetDivisionIds = Object.keys(UPCOMING_PLAYER_CAPS_BY_DIVISION);
  await Promise.all(
    targetDivisionIds.map(async (divId) => {
      const teamsBody = new URLSearchParams();
      teamsBody.set('group_ids[division]', divId);
      teamsBody.set('season_id', UPCOMING_SEASON_ID);
      const teamsRes = await fetch(UPCOMING_TEAMS_API_URL, { method: 'POST', body: teamsBody });
      if (!teamsRes.ok) return;
      const teams: unknown = await teamsRes.json();
      if (!Array.isArray(teams)) return;
      const teamIds = teams.map((t: { id?: number | string }) => t.id).filter((id): id is number | string => id != null);
      const memberCounts = await Promise.all(
        teamIds.map(async (teamId) => {
          const res = await fetch(`${API_BASE}/getTeam/${ORG_ID}/${teamId}`);
          if (!res.ok) return 0;
          const data: { payload?: { Team?: { team_member_count?: number } } } = await res.json();
          return data.payload?.Team?.team_member_count ?? 0;
        })
      );
      counts[divId] = memberCounts.reduce((sum, n) => sum + n, 0);
    })
  );
  return counts;
}
