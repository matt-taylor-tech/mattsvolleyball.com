// The player's saved team ("My team"), kept in this browser only. Storage can
// be missing or throw (private windows, blocked site data), so every access is
// guarded and callers treat a null team as "none saved".
//
// Team ids are per season in TeamLinkt, so a saved team from last season simply
// stops matching anything; pages hide their my-team UI when nothing matches.

export interface MyTeam {
  id: number;
  name: string;
}

const KEY = 'mv:my-team';

export function getMyTeam(): MyTeam | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const t = JSON.parse(raw);
    return typeof t?.id === 'number' && typeof t?.name === 'string' ? t : null;
  } catch {
    return null;
  }
}

export function setMyTeam(team: MyTeam | null): void {
  try {
    if (team) localStorage.setItem(KEY, JSON.stringify({ id: team.id, name: team.name }));
    else localStorage.removeItem(KEY);
  } catch {
    // Not saved; the page still works, it just won't remember.
  }
}

/** Case-insensitive name match, for pages whose rows carry names but not ids. */
export function isMyTeamName(name: string, team: MyTeam | null = getMyTeam()): boolean {
  return !!team && name.trim().toLowerCase() === team.name.trim().toLowerCase();
}
