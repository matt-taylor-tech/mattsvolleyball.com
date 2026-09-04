import { fetchUpcomingTeamCountsByDivision, fetchUpcomingPlayerCountsByDivision } from './teamCounts';
import {
  UPCOMING_DIVISIONS,
  UPCOMING_MAX_TEAMS_BY_DIVISION,
  UPCOMING_MAX_TEAMS_BY_NIGHT,
  UPCOMING_PLAYER_CAPS_BY_DIVISION,
} from './seasonConfig';

// Fills in the "X of Y teams · Z spots left" lines on the home and leagues
// pages. For a night whose cap is shared by more than one division, this adds
// a second line breaking down signups by division, e.g.:
//   4 of 12 night spots left
//   Signed up: 5 Competitive, 3 Recreational
// Runs in the browser after load, so a slow or failed TeamLinkt call never
// blocks the page.
//
// Two kinds of placeholder element are supported:
//   data-team-count-night="Tue"     -> one line (two when the night has more
//                                      than one division) for the whole night,
//                                      adding up every division that plays it
//   data-team-count-division="123"  -> one line for a single division
//
// Optional attributes on either kind:
//   data-count-unit="players"       -> count players instead of teams
//   data-division-name="Competitive" -> prefix the line with a label

function spotsText(count: number, max: number, unit: 'teams' | 'players', prefix: string): string {
  const spotsLeft = Math.max(0, max - count);
  if (spotsLeft === 0) {
    return unit === 'players'
      ? `${prefix}All ${max} player spots taken`
      : `${prefix}All teams set · Join an existing team or as a free agent`;
  }
  return `${prefix}${count} of ${max} ${unit} · ${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left`;
}

// Night-level cap shared by more than one division: the plain "X of Y teams"
// count doesn't say how those teams split between divisions, so a second line
// spells that out explicitly rather than packing bare numbers into one line.
function nightSpotsText(count: number, max: number, breakdown: string): string {
  const spotsLeft = Math.max(0, max - count);
  const summary = spotsLeft === 0
    ? 'All teams set · Join an existing team or as a free agent'
    : `${spotsLeft} of ${max} night spot${spotsLeft === 1 ? '' : 's'} left`;
  return `${summary}\nSigned up: ${breakdown}`;
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
    el.textContent = breakdown ? nightSpotsText(count, max, breakdown) : spotsText(count, max, unit, prefix);
    el.classList.remove('italic', 'opacity-60');
  });
}
