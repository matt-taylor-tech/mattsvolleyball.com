// ── Season Configuration ─────────────────────────────────────────────────────
// This is the single place to update when transitioning between seasons.
//
// WHAT TO UPDATE when a new season starts:
//   1. ACTIVE_SEASON_ID / ACTIVE_DIVISIONS for live stats pages
//   2. UPCOMING_SEASON_ID / UPCOMING_DIVISIONS for registration-focused pages
//
// The leagues page registration cards pull live from TeamLinkt automatically
// (src/lib/registration.ts). Only the schedule, standings, scores, teams,
// and playoffs pages consume the config below.
// ─────────────────────────────────────────────────────────────────────────────

// ── Base seasons ──────────────────────────────────────────────────────────────
const CURRENT_SEASON = {
  id: '52672',
  label: 'Summer I 2026',
};

const NEXT_SEASON = {
  id: '57274',
  label: 'Summer Redux 2026',
};

const NEXT_NEXT_SEASON = {
  id: 'TBD', // Will update when Fall season is created in TeamLinkt
  label: 'Fall 2026',
};

const FUTURE_SEASON = {
  id: 'TBD', // Will update when next season is created in TeamLinkt
  label: 'TBD',
};

// Auto-rollover trigger for live data pages.
// Note: for static deployments this takes effect on the next build.
export const ACTIVE_ROLLOVER_DATE = '2026-07-17 00:00:00'; // Summer I ends with the Thu 7/16 finals; Redux takes over Friday
const now = new Date();
const rolloverAt = new Date(ACTIVE_ROLLOVER_DATE);
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
export const UPCOMING_REG_OPEN_DATETIME = '2026-07-06 00:00:00';

// Human-readable start of the upcoming season, shown alongside the coming-soon
// announcement. Free-form (e.g. "the week of July 27") since the exact first-game
// date may not be fixed yet. Set to '' to hide.
export const UPCOMING_SEASON_START_LABEL = 'the week of July 27';

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
  // ── Monday ───────────────────────────────────────────────────────────────
  { id: '293497', name: '3v3 Coed',      day: 'Mon', label: 'Mon 3v3 Coed',      court: 'Court 1', hasPlayoffs: true,  playoffTeamCount: 5 },
  // ── Tuesday ──────────────────────────────────────────────────────────────
  { id: '280407', name: 'Competitive',  day: 'Tue', label: 'Tue Competitive',  court: 'Court 1', hasPlayoffs: true  },
  { id: '280406', name: 'Recreational', day: 'Tue', label: 'Tue Recreational', court: 'Court 2', hasPlayoffs: true  },
  // ── Wednesday ────────────────────────────────────────────────────────────
  { id: '280410', name: 'Shuffle',      day: 'Wed', label: 'Wed Shuffle',       court: 'Court 1', hasPlayoffs: false },
  // ── Thursday ─────────────────────────────────────────────────────────────
  { id: '280408', name: 'Competitive',  day: 'Thu', label: 'Thu Competitive',  court: 'Court 1', hasPlayoffs: true  },
  { id: '280409', name: 'Recreational', day: 'Thu', label: 'Thu Recreational', court: 'Court 2', hasPlayoffs: true  },
];

export const UPCOMING_DIVISIONS: DivisionConfig[] = [
  // ── Monday ───────────────────────────────────────────────────────────────
  { id: '305895', name: '3v3 Coed',      day: 'Mon', label: 'Mon 3v3 Coed',      court: 'Court 1', hasPlayoffs: true  },
  // ── Tuesday ──────────────────────────────────────────────────────────────
  { id: '305891', name: 'Competitive',  day: 'Tue', label: 'Tue Competitive',  court: 'Court 1', hasPlayoffs: true  },
  { id: '305890', name: 'Recreational', day: 'Tue', label: 'Tue Recreational', court: 'Court 2', hasPlayoffs: true  },
  // ── Wednesday ────────────────────────────────────────────────────────────
  // Kept as just "Shuffle": may run 3v3 or 4v4 depending on nightly attendance.
  { id: '305894', name: 'Shuffle',      day: 'Wed', label: 'Wed Shuffle',       court: 'Court 1', hasPlayoffs: false },
  // ── Thursday ─────────────────────────────────────────────────────────────
  { id: '305892', name: 'Competitive',  day: 'Thu', label: 'Thu Competitive',  court: 'Court 1', hasPlayoffs: true  },
  { id: '305893', name: 'Recreational', day: 'Thu', label: 'Thu Recreational', court: 'Court 2', hasPlayoffs: true  },
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
export const REGISTRATION_PAGE_URL = 'https://app.teamlinkt.com/register/find/mattsvolleyball';

export const EVENTS_API    = `${API_BASE}/getAllEvents/${ORG_ID}`;
export const TEAMS_API_URL = `${API_BASE}/getTeams/${ORG_ID}/${ACTIVE_SEASON_ID}`;
export const STANDINGS_API_URL = `${API_BASE}/getStandings/${ORG_ID}/${ACTIVE_SEASON_ID}`;
export const UPCOMING_TEAMS_API_URL = `${API_BASE}/getTeams/${ORG_ID}/${UPCOMING_SEASON_ID}`;

// ── Playoffs ──────────────────────────────────────────────────────────────────
// Set PLAYOFFS_ACTIVE = true once the regular season is complete and playoff
// brackets have been created in TeamLinkt. This unlocks the playoff bracket view
// and adds playoff games to the schedule.
// PLAYOFF_ID is the TeamLinkt playoff bracket ID — find it in the "Playoffs"
// schedule type dropdown on the TeamLinkt Schedule page.
export const PLAYOFFS_ACTIVE = true;
export const PLAYOFF_ID = '15272';

// Max teams per division for the upcoming season. Keyed by division id.
// Wednesday uses a player cap instead - see UPCOMING_PLAYER_CAPS_BY_DIVISION.
export const UPCOMING_MAX_TEAMS_BY_DIVISION: Record<string, number> = {
  '305895': 12, // Mon 3v3 Coed
  '305891': 8,  // Tue Competitive
  '305890': 6,  // Tue Recreational
  '305892': 8,  // Thu Competitive (reduced from 10 - dropped the 9:30 slot)
  '305893': 6,  // Thu Recreational
};

// Max players per division for the upcoming season. Used for shuffle-style
// leagues where individuals sign up to a single roster (One Big Happy Team)
// rather than registering as teams.
export const UPCOMING_PLAYER_CAPS_BY_DIVISION: Record<string, number> = {
  '305894': 28, // Wed Shuffle: One Big Happy Team
};
