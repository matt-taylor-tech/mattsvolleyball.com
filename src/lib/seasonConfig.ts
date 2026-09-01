// ── Season Configuration ─────────────────────────────────────────────────────
// This is the single place to update when transitioning between seasons.
//
// WHAT TO UPDATE when a new season starts:
//   1. CURRENT_SEASON + CURRENT_DIVISIONS for live stats pages (move both, or
//      the pages ask the new season for old division ids and come back empty)
//   2. NEXT_SEASON + UPCOMING_DIVISIONS for registration-focused pages
//   3. ACTIVE_ROLLOVER_DATE: when the live pages switch from current to next
//   4. The announcement copy: UPCOMING_REG_OPEN_DATETIME,
//      UPCOMING_SEASON_START_LABEL, UPCOMING_REGULAR_SEASON_WEEKS
//   5. The caps at the bottom of this file
// Then run `npm run check:teamlinkt`. teamlinkt.md has the full runbook.
//
// The leagues page registration cards pull live from TeamLinkt automatically
// (src/lib/registration.ts). Only the schedule, standings, scores, teams,
// and playoffs pages consume the config below.
// ─────────────────────────────────────────────────────────────────────────────

// ── Base seasons ──────────────────────────────────────────────────────────────
const CURRENT_SEASON = {
  id: '57274',
  label: 'Summer Redux 2026',
  // Playoff nights, as YYYY-MM-DD. See ACTIVE_PLAYOFF_DATES below for why the
  // dates are listed by hand instead of read from TeamLinkt.
  playoffDates: ['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-22', '2026-09-24'],
};

const NEXT_SEASON = {
  id: '60566',
  label: 'Fall 2026',
  playoffDates: [] as string[], // Fill in when the Fall playoff nights are set
};

const NEXT_NEXT_SEASON = {
  id: 'TBD', // Will update when the season after Fall is created in TeamLinkt
  label: 'Next Season', // Generic on purpose: the name after Fall 2026 is not set
};

const FUTURE_SEASON = {
  id: 'TBD', // Will update when next season is created in TeamLinkt
  label: 'TBD',
};

// First game date for the upcoming season. This drives the switch from
// registration-focused copy to "the season is underway", and it drives the
// live-data rollover below. Format: 'YYYY-MM-DD HH:MM:SS' (local time).
export const UPCOMING_SEASON_START_DATETIME = '2026-09-29 00:00:00';

// Display override for the start date, for when the exact first-game date is
// not fixed yet (e.g. 'the week of July 27'). Leave empty to show the real date.
const UPCOMING_SEASON_START_LABEL_OVERRIDE = '';

const upcomingStartAt = new Date(UPCOMING_SEASON_START_DATETIME.replace(' ', 'T'));
const upcomingStartIsValid = !Number.isNaN(upcomingStartAt.getTime());

/** Human-readable start of the upcoming season, e.g. "September 29". */
export const UPCOMING_SEASON_START_LABEL = UPCOMING_SEASON_START_LABEL_OVERRIDE
  || (upcomingStartIsValid
    ? upcomingStartAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    : '');

// True once the upcoming season's first game day has arrived. The site then
// stops leading with registration and says the season is underway, even if a
// late-open league (Wednesday shuffle) is still taking signups.
export const HAS_UPCOMING_SEASON_STARTED = upcomingStartIsValid && new Date() >= upcomingStartAt;

// Auto-rollover trigger for live data pages (schedule / teams / standings /
// scores). It fires on the upcoming season's first game day, so the live pages
// keep showing the current season until its last game, playoffs included. That
// means there is no playoff end date to guess here.
// Move this earlier if you want the new season's schedule visible sooner; keep
// it after the current season's last playoff night either way.
// Note: for static deployments this takes effect on the next build.
export const ACTIVE_ROLLOVER_DATE = UPCOMING_SEASON_START_DATETIME;
const now = new Date();
const rolloverAt = new Date(ACTIVE_ROLLOVER_DATE.replace(' ', 'T'));
export const HAS_ACTIVE_ROLLED_OVER = !Number.isNaN(rolloverAt.getTime()) && now >= rolloverAt;

// ── Active Season (schedule / standings / scores / teams / playoffs) ─────────
export const ACTIVE_SEASON_ID = HAS_ACTIVE_ROLLED_OVER ? NEXT_SEASON.id : CURRENT_SEASON.id;
export const ACTIVE_SEASON_LABEL = HAS_ACTIVE_ROLLED_OVER ? NEXT_SEASON.label : CURRENT_SEASON.label;

// ── Upcoming Season (promotion / registration) ───────────────────────────────
export const UPCOMING_SEASON_ID = NEXT_SEASON.id;
export const UPCOMING_SEASON_LABEL = NEXT_SEASON.label;

// Announced registration open date/time for the upcoming season. Used to drive a
// "coming soon" hero BEFORE TeamLinkt publishes the forms on its public page.
// Once the forms are public, live TeamLinkt data takes over automatically and
// this becomes inert. Set to '' to disable the announcement.
// Format: 'YYYY-MM-DD HH:MM:SS' (local time).
// Matches the open date on the TeamLinkt forms. Live data wins once the forms
// are visible, so this only covers the gap before then.
export const UPCOMING_REG_OPEN_DATETIME = '2026-09-03 00:00:00';

// Length of the upcoming regular season, in weeks, plus how playoffs run. Used
// by promo copy on the home and leagues pages so the week count lives in one
// place. Fall 2026: 6 game weeks, no bye, then a separate playoff week.
export const UPCOMING_REGULAR_SEASON_WEEKS = 6;

// ── Future Seasons (for promotional display when current closes) ──────────────
export const NEXT_NEXT_SEASON_LABEL = NEXT_NEXT_SEASON.label;
export const FUTURE_SEASON_LABEL = FUTURE_SEASON.label;

// ── Division definitions ─────────────────────────────────────────────────────
export interface DivisionConfig {
  id: string;
  name: string;       // short name shown in tabs / brackets ("Competitive", "Shuffle" …)
  day: string;        // day key matching TeamLinkt date prefix: 'Mon' | 'Tue' | 'Wed' | 'Thu'
  label: string;      // full tab label ("Mon 3v3 Coed", "Tue Competitive" …)
  court: string;      // court assignment for playoffs page
  hasPlayoffs: boolean;
  playoffTeamCount?: number; // how many seeds enter the bracket (default 6)
}

const CURRENT_DIVISIONS: DivisionConfig[] = [
  // Summer Redux 2026. Monday 3v3 was canceled after signups came in short, but
  // the division still exists in TeamLinkt, so it stays listed here.
  // ── Monday ───────────────────────────────────────────────────────────────
  { id: '305895', name: '3v3 Coed',      day: 'Mon', label: 'Mon 3v3 Coed',      court: 'Court 1', hasPlayoffs: true  },
  // ── Tuesday ──────────────────────────────────────────────────────────────
  { id: '305891', name: 'Competitive',  day: 'Tue', label: 'Tue Competitive',  court: 'Court 1', hasPlayoffs: true  },
  { id: '305890', name: 'Recreational', day: 'Tue', label: 'Tue Recreational', court: 'Court 2', hasPlayoffs: true  },
  // ── Wednesday ────────────────────────────────────────────────────────────
  { id: '305894', name: 'Shuffle',      day: 'Wed', label: 'Wed Shuffle',       court: 'Court 1', hasPlayoffs: false },
  // ── Thursday ─────────────────────────────────────────────────────────────
  { id: '305892', name: 'Competitive',  day: 'Thu', label: 'Thu Competitive',  court: 'Court 1', hasPlayoffs: true  },
  { id: '305893', name: 'Recreational', day: 'Thu', label: 'Thu Recreational', court: 'Court 2', hasPlayoffs: true  },
];

export const UPCOMING_DIVISIONS: DivisionConfig[] = [
  // Fall 2026. Monday 3v3 Coed does not run this season, so it is not listed
  // here. TeamLinkt still holds a Monday division (324563) if it comes back.
  // ── Tuesday ──────────────────────────────────────────────────────────────
  { id: '324560', name: 'Competitive',  day: 'Tue', label: 'Tue Competitive',  court: 'Court 1', hasPlayoffs: true  },
  { id: '324559', name: 'Recreational', day: 'Tue', label: 'Tue Recreational', court: 'Court 2', hasPlayoffs: true  },
  // ── Wednesday ────────────────────────────────────────────────────────────
  // Kept as just "Shuffle": may run 3v3 or 4v4 depending on nightly attendance.
  { id: '324564', name: 'Shuffle',      day: 'Wed', label: 'Wed Shuffle',       court: 'Court 1', hasPlayoffs: false },
  // ── Thursday ─────────────────────────────────────────────────────────────
  { id: '324561', name: 'Competitive',  day: 'Thu', label: 'Thu Competitive',  court: 'Court 1', hasPlayoffs: true  },
  { id: '324562', name: 'Recreational', day: 'Thu', label: 'Thu Recreational', court: 'Court 2', hasPlayoffs: true  },
];

// Active aliases used by live stats pages (Schedule / Teams / Standings / Scores / Playoffs)
export const ACTIVE_DIVISIONS: DivisionConfig[] = HAS_ACTIVE_ROLLED_OVER ? UPCOMING_DIVISIONS : CURRENT_DIVISIONS;
export const DIVISIONS: DivisionConfig[] = ACTIVE_DIVISIONS;

// ── Derived helpers (no need to edit below this line) ────────────────────────
export const DIVISION_IDS: string[] = DIVISIONS.map((d) => d.id);

export const DIVISIONS_BY_DAY: Record<string, string[]> = {};
for (const d of DIVISIONS) {
  if (!DIVISIONS_BY_DAY[d.day]) DIVISIONS_BY_DAY[d.day] = [];
  DIVISIONS_BY_DAY[d.day].push(d.id);
}

export const DAY_FOR_DIVISION: Record<string, string> = {};
for (const d of DIVISIONS) DAY_FOR_DIVISION[d.id] = d.day;

export const DIVISION_NAME: Record<string, string> = {};
for (const d of DIVISIONS) DIVISION_NAME[d.id] = d.name;

export const DIVISION_LABEL: Record<string, string> = {};
for (const d of DIVISIONS) DIVISION_LABEL[d.id] = d.label;

// Upcoming helpers used by registration-focused pages/widgets
export const UPCOMING_DIVISION_IDS: string[] = UPCOMING_DIVISIONS.map((d) => d.id);

export const UPCOMING_DIVISIONS_BY_DAY: Record<string, string[]> = {};
for (const d of UPCOMING_DIVISIONS) {
  if (!UPCOMING_DIVISIONS_BY_DAY[d.day]) UPCOMING_DIVISIONS_BY_DAY[d.day] = [];
  UPCOMING_DIVISIONS_BY_DAY[d.day].push(d.id);
}

export const UPCOMING_DIVISION_NAME: Record<string, string> = {};
for (const d of UPCOMING_DIVISIONS) UPCOMING_DIVISION_NAME[d.id] = d.name;

/** Ordered, unique days present in the current season (preserves insertion order). */
export const ACTIVE_DAYS: string[] = [...new Set(DIVISIONS.map((d) => d.day))];

export const DAY_FULL_LABEL: Record<string, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
};

// ── API URLs ──────────────────────────────────────────────────────────────────
const ORG_ID = '10757';
const API_BASE = 'https://app.mattsvolleyball.com/leagues';
// TeamLinkt registration containers for the upcoming season, one per night.
// The id is TeamLinkt's association_registration_container_id, which its own
// links pass as the `cid` query parameter.
//
// Why this matters: TeamLinkt's public find page lists only the forms that are
// open RIGHT NOW. Before registration opens it renders "There are currently no
// registration forms available", so a visitor sees nothing and the scraper in
// src/lib/registration.ts finds nothing. Adding any cid makes the page list the
// whole season's forms with their real open and close dates. Any single cid
// lists them all; the id only decides which night starts out selected.
//
// These ids change every season. Get them from the registration links TeamLinkt
// generates for each night.
export const UPCOMING_REG_CONTAINER_IDS: Record<string, string> = {
  Tue: '77315',
  Wed: '77316',
  Thu: '77317',
};

const REG_FIND_BASE = 'https://app.teamlinkt.com/register/find/mattsvolleyball';

/** Where every "Register Now" link on the site should point. */
export const REGISTRATION_PAGE_URL = UPCOMING_REG_CONTAINER_IDS.Tue
  ? `${REG_FIND_BASE}?cid=${UPCOMING_REG_CONTAINER_IDS.Tue}`
  : REG_FIND_BASE;

/** Registration page for one night, for a day key like 'Wed'. */
export function registrationPageUrlForDay(day: string): string {
  const cid = UPCOMING_REG_CONTAINER_IDS[day];
  return cid ? `${REG_FIND_BASE}?cid=${cid}` : REGISTRATION_PAGE_URL;
}

// Pages the scraper tries in order. The first one that lists any form wins, so
// the bare page still works if the container ids ever go stale.
export const REGISTRATION_SCRAPE_URLS: string[] = [
  ...new Set([REGISTRATION_PAGE_URL, REG_FIND_BASE]),
];

export const EVENTS_API    = `${API_BASE}/getAllEvents/${ORG_ID}`;
export const TEAMS_API_URL = `${API_BASE}/getTeams/${ORG_ID}/${ACTIVE_SEASON_ID}`;
export const STANDINGS_API_URL = `${API_BASE}/getStandings/${ORG_ID}/${ACTIVE_SEASON_ID}`;
export const UPCOMING_TEAMS_API_URL = `${API_BASE}/getTeams/${ORG_ID}/${UPCOMING_SEASON_ID}`;

// ── Playoffs ──────────────────────────────────────────────────────────────────
// Playoff nights are listed by date on each season above, and everything else
// is worked out from that list.
//
// Why dates and not the API: playoff games are sometimes entered in TeamLinkt as
// ordinary regular-season games, with no bracket behind them. When that happens
// nothing in the API marks them as playoffs, so the API cannot be the source of
// truth. The night itself is the fact we always know in advance.
//
// This separates two things the old single flag mixed together:
//   1. "Is tonight a playoff night?" -> the date list. Always answerable, and it
//      labels games whichever way they were entered.
//   2. "Is there a bracket to draw?" -> PLAYOFF_ID. Only true when a real
//      bracket exists in TeamLinkt.
export const ACTIVE_PLAYOFF_DATES: string[] = [
  ...(HAS_ACTIVE_ROLLED_OVER ? NEXT_SEASON.playoffDates : CURRENT_SEASON.playoffDates),
].sort();

const MONTH_NUMBERS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

/**
 * Normalises a date to 'YYYY-MM-DD'. Accepts TeamLinkt's display format
 * ('Tue Sep 15, 2026') as well as an ISO date. Returns '' if neither matches.
 * Deliberately string-based: parsing to a Date would shift the day for a
 * viewer in another time zone, and these are league dates, not instants.
 */
export function toDateKey(value: string): string {
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const parts = value.match(/([A-Z][a-z]{2})\s+(\d{1,2}),\s*(\d{4})/);
  if (!parts) return '';
  const month = MONTH_NUMBERS[parts[1]];
  return month ? `${parts[3]}-${month}-${parts[2].padStart(2, '0')}` : '';
}

/** True when a date is one of the active season's playoff nights. */
export function isPlayoffDate(value: string): boolean {
  const key = toDateKey(value);
  return key !== '' && ACTIVE_PLAYOFF_DATES.includes(key);
}

const todayKey = new Date().toLocaleDateString('en-CA');

// True from the first playoff night onward. Stays true after the last one so
// the finished bracket keeps showing, until the season rolls over.
export const PLAYOFFS_ACTIVE =
  ACTIVE_PLAYOFF_DATES.length > 0 && todayKey >= ACTIVE_PLAYOFF_DATES[0];

// The TeamLinkt bracket id, from the "Playoffs" schedule type dropdown on the
// TeamLinkt Schedule page. Leave empty when playoff games were entered as
// regular-season games: the schedule still labels them from the dates above,
// and the bracket page reports that there is no bracket to show.
export const PLAYOFF_ID = '';

// Max teams per NIGHT for the upcoming season, keyed by day. Fall 2026 caps
// Tuesday and Thursday at 12 teams each. The split between the Recreational and
// Competitive divisions is not fixed: it follows signups. So the cap and the
// "spots left" counter work at the night level, and the site adds up the teams
// in both of that night's divisions.
// Wednesday uses a player cap instead - see UPCOMING_PLAYER_CAPS_BY_DIVISION.
export const UPCOMING_MAX_TEAMS_BY_NIGHT: Record<string, number> = {
  Tue: 12, // 6 games over 3 time slots on 2 courts
  Thu: 12,
};

// Max teams for a single division, keyed by division id. Use this only when one
// division has its own hard cap. Fall 2026 caps by night instead, so this is
// empty. A night cap wins if both are set for the same division.
export const UPCOMING_MAX_TEAMS_BY_DIVISION: Record<string, number> = {};

// Max players per division for the upcoming season. Used for shuffle-style
// leagues where individuals sign up to a single roster (One Big Happy Team)
// rather than registering as teams.
export const UPCOMING_PLAYER_CAPS_BY_DIVISION: Record<string, number> = {
  '324564': 30, // Wed Shuffle: One Big Happy Team
};
