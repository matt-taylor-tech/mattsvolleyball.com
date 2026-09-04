import { fetchUpcomingTeamCountsByDivision, fetchUpcomingPlayerCountsByDivision } from './teamCounts';
import {
  UPCOMING_DIVISIONS,
  UPCOMING_MAX_TEAMS_BY_DIVISION,
  UPCOMING_MAX_TEAMS_BY_NIGHT,
  UPCOMING_PLAYER_CAPS_BY_DIVISION,
} from './seasonConfig';

// Fills in the "X of Y teams · Z spots left" (or, for a night with more than
// one division, "5 Competitive, 3 Recreational · Z spots left") lines on the
// home and leagues pages. Runs in the browser after load, so a slow or failed
// TeamLinkt call never blocks the page.
//
// Two kinds of placeholder element are supported:
//   data-team-count-night="Tue"     -> one line for the whole night, adding up
//                                      every division that plays that night
//   data-team-count-division="123"  -> one line for a single division
//
// Optional attributes on either kind:
//   data-count-unit="players"       -> count players instead of teams
//   data-division-name="Competitive" -> prefix the line with a label

function spotsText(count: number, max: number, unit: 'teams' | 'players', prefix: string, breakdown = ''): string {
  const spotsLeft = Math.max(0, max - count);
  // When a breakdown (e.g. "5 Competitive, 3 Recreational") is given, it leads
  // the line in place of the plain "X of Y teams" count.
  const lead = breakdown || `${count} of ${max} ${unit}`;
  if (spotsLeft === 0) {
    return unit === 'players'
      ? `${prefix}All ${max} player spots taken`
      : `${prefix}${lead} · All teams set · Join an existing team or as a free agent`;
  }
  return `${prefix}${lead} · ${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left`;
}

export async function renderSpotCounters(): Promise<void> {
  const slots = document.querySelectorAll<HTMLElement>(
    '[data-team-count-division], [data-team-count-night]'
  );
  if (slots.length === 0) return;

  let teamCounts: Record<string, number>;
  let playerCounts: Record<string, number>;
  try {
    [teamCounts, playerCounts] = await Promise.all([
      fetchUpcomingTeamCountsByDivision(),
      fetchUpcomingPlayerCountsByDivision(),
    ]);
  } catch {
    return; // Leave the placeholders as they are on failure.
  }

  slots.forEach((el) => {
    const night = el.dataset.teamCountNight;
    const divId = el.dataset.teamCountDivision;
    const isPlayers = el.dataset.countUnit === 'players';
    const unit = isPlayers ? 'players' : 'teams';
    const name = el.dataset.divisionName;
    const prefix = name ? `${name}: ` : '';

    let max: number | undefined;
    let count = 0;
    let breakdown = '';

    if (night) {
      // Night cap: add up every division that plays that night.
      max = UPCOMING_MAX_TEAMS_BY_NIGHT[night];
      const nightDivisions = UPCOMING_DIVISIONS.filter((d) => d.day === night);
      count = nightDivisions.reduce((sum, d) => {
        return sum + (isPlayers ? (playerCounts[d.id] ?? 0) : (teamCounts[d.id] ?? 0));
      }, 0);
      // Show the Recreational/Competitive split, since the night cap alone
      // hides how signups landed between the two divisions.
      if (!isPlayers && nightDivisions.length > 1) {
        breakdown = nightDivisions.map((d) => `${teamCounts[d.id] ?? 0} ${d.name}`).join(', ');
      }
    } else if (divId) {
      max = isPlayers ? UPCOMING_PLAYER_CAPS_BY_DIVISION[divId] : UPCOMING_MAX_TEAMS_BY_DIVISION[divId];
      count = isPlayers ? (playerCounts[divId] ?? 0) : (teamCounts[divId] ?? 0);
    }

    if (!max) return;
    el.textContent = spotsText(count, max, unit, prefix, breakdown);
    el.classList.remove('italic', 'opacity-60');
  });
}
