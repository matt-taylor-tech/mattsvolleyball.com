import { fetchUpcomingTeamCountsByDivision, fetchUpcomingPlayerCountsByDivision } from './teamCounts';
import {
  UPCOMING_DIVISIONS,
  UPCOMING_MAX_TEAMS_BY_DIVISION,
  UPCOMING_MAX_TEAMS_BY_NIGHT,
  UPCOMING_PLAYER_CAPS_BY_DIVISION,
} from './seasonConfig';

// Fills in the "X of Y teams · Z spots left" lines on the home and leagues
// pages, and relabels the sign-up buttons above them once a night is full.
// For a night whose cap is shared by more than one division, this adds a
// second line breaking down signups by division, e.g.:
//   4 of 12 team spots left
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
//
// Sign-up buttons opt in with the same two keys under a different name:
//   data-signup-night="Tue" / data-signup-division="123", plus
//   data-signup-label="Competitive" for the division suffix in the label.

type Unit = 'teams' | 'players';

interface Counts {
  teams: Record<string, number>;
  players: Record<string, number>;
}

function spotsText(count: number, max: number, unit: Unit, prefix: string): string {
  const spotsLeft = Math.max(0, max - count);
  if (spotsLeft === 0) {
    // Past the cap TeamLinkt keeps the form open and takes signups as a
    // waitlist without charging them, so say that rather than "closed".
    return unit === 'players'
      ? `${prefix}All ${max} player spots taken · No charge to join the waitlist`
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
    : `${spotsLeft} of ${max} team spot${spotsLeft === 1 ? '' : 's'} left`;
  return `${summary}\nSigned up: ${breakdown}`;
}

/**
 * What a sign-up button says once its night or division is at cap.
 *
 * The link never changes: TeamLinkt leaves the form open past the cap and
 * takes the extra signups as a waitlist, free of charge. What changes is the
 * promise the button makes. A player-cap night has no team to join, so the
 * honest offer is the waitlist. A team-cap night still needs every player on
 * an already-registered roster to sign up individually, so the offer there is
 * to join a team that already exists, not to enter one that cannot fit.
 *
 * "Join a Team" and not "Join Your Team": the longer phrase wraps the button
 * onto a second line at every width once the division is appended to it.
 */
function fullSignupLabel(unit: Unit, label: string): string {
  if (unit === 'players') return 'Join the Waitlist';
  return label ? `Join a Team - ${label}` : 'Join a Team';
}

/** The unit a division is capped in: players for shuffle-style rosters, else teams. */
function unitForDivision(divId: string): Unit {
  return divId in UPCOMING_PLAYER_CAPS_BY_DIVISION ? 'players' : 'teams';
}

/**
 * Signups against the cap for one night or one division.
 * `max` is undefined when nothing caps that target, and callers skip it.
 */
function tally(
  target: { night?: string; divId?: string; unit: Unit },
  counts: Counts,
): { count: number; max?: number; breakdown: string } {
  const { night, divId, unit } = target;
  const isPlayers = unit === 'players';
  const countFor = (id: string) => (isPlayers ? counts.players[id] ?? 0 : counts.teams[id] ?? 0);

  if (night) {
    // Night cap: add up every division that plays that night.
    const nightDivisions = UPCOMING_DIVISIONS.filter((d) => d.day === night);
    // Show the Recreational/Competitive split, since the night cap alone
    // hides how signups landed between the two divisions.
    const breakdown = !isPlayers && nightDivisions.length > 1
      ? nightDivisions.map((d) => `${counts.teams[d.id] ?? 0} ${d.name}`).join(', ')
      : '';
    return {
      count: nightDivisions.reduce((sum, d) => sum + countFor(d.id), 0),
      max: UPCOMING_MAX_TEAMS_BY_NIGHT[night],
      breakdown,
    };
  }

  if (divId) {
    return {
      count: countFor(divId),
      max: isPlayers ? UPCOMING_PLAYER_CAPS_BY_DIVISION[divId] : UPCOMING_MAX_TEAMS_BY_DIVISION[divId],
      breakdown: '',
    };
  }

  return { count: 0, max: undefined, breakdown: '' };
}

function renderCounterLines(counts: Counts): void {
  document.querySelectorAll<HTMLElement>(
    '[data-team-count-division], [data-team-count-night]'
  ).forEach((el) => {
    const night = el.dataset.teamCountNight;
    const divId = el.dataset.teamCountDivision;
    const unit: Unit = el.dataset.countUnit === 'players' ? 'players' : 'teams';
    const name = el.dataset.divisionName;
    const prefix = name ? `${name}: ` : '';

    const { count, max, breakdown } = tally({ night, divId, unit }, counts);
    if (!max) return;

    el.textContent = breakdown ? nightSpotsText(count, max, breakdown) : spotsText(count, max, unit, prefix);
    el.classList.remove('italic', 'opacity-60');
  });
}

/**
 * Retitles the sign-up buttons for nights that are already full, so a card
 * never offers a spot that no longer exists. Buttons that still have room are
 * left exactly as the page rendered them.
 */
function relabelFullSignupButtons(counts: Counts): void {
  document.querySelectorAll<HTMLAnchorElement>(
    '[data-signup-night], [data-signup-division]'
  ).forEach((el) => {
    const night = el.dataset.signupNight;
    const divId = el.dataset.signupDivision;
    const unit: Unit = night ? 'teams' : divId ? unitForDivision(divId) : 'teams';

    const { count, max } = tally({ night, divId, unit }, counts);
    if (!max || count < max) return;

    el.textContent = fullSignupLabel(unit, el.dataset.signupLabel ?? '');
  });
}

export async function renderSpotCounters(): Promise<void> {
  const hasSlots = document.querySelector(
    '[data-team-count-division], [data-team-count-night], [data-signup-night], [data-signup-division]'
  );
  if (!hasSlots) return;

  let counts: Counts;
  try {
    const [teams, players] = await Promise.all([
      fetchUpcomingTeamCountsByDivision(),
      fetchUpcomingPlayerCountsByDivision(),
    ]);
    counts = { teams, players };
  } catch {
    return; // Leave the placeholders and buttons as they are on failure.
  }

  renderCounterLines(counts);
  relabelFullSignupButtons(counts);
}
