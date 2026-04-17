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
  id: '51955',
  label: 'Spring 2026',
};

const NEXT_SEASON = {
  id: '52672',
  label: 'Summer I 2026',
};

const NEXT_NEXT_SEASON = {
  id: 'TBD', // Will update when Summer II season is created in TeamLinkt
  label: 'Summer II 2026',
};

const FUTURE_SEASON = {
  id: 'TBD', // Will update when Fall season is created in TeamLinkt
  label: 'Fall 2026',
};

// Auto-rollover trigger for live data pages.
// Note: for static deployments this takes effect on the next build.
export const ACTIVE_ROLLOVER_DATE = '2026-05-15T00:00:00-04:00';
const now = new Date();
const rolloverAt = new Date(ACTIVE_ROLLOVER_DATE);
export const HAS_ACTIVE_ROLLED_OVER = !Number.isNaN(rolloverAt.getTime()) && now >= rolloverAt;

// ── Active Season (schedule / standings / scores / teams / playoffs) ─────────
export const ACTIVE_SEASON_ID = HAS_ACTIVE_ROLLED_OVER ? NEXT_SEASON.id : CURRENT_SEASON.id;
export const ACTIVE_SEASON_LABEL = HAS_ACTIVE_ROLLED_OVER ? NEXT_SEASON.label : CURRENT_SEASON.label;

// ── Upcoming Season (promotion / registration) ───────────────────────────────
export const UPCOMING_SEASON_ID = NEXT_SEASON.id;
export const UPCOMING_SEASON_LABEL = NEXT_SEASON.label;

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
}

const CURRENT_DIVISIONS: DivisionConfig[] = [
  // ── Tuesday ──────────────────────────────────────────────────────────────
  { id: '276787', name: 'Competitive',  day: 'Tue', label: 'Tue Competitive',  court: 'Court 1', hasPlayoffs: true  },
  { id: '276786', name: 'Recreational', day: 'Tue', label: 'Tue Recreational', court: 'Court 2', hasPlayoffs: true  },
  // ── Wednesday ────────────────────────────────────────────────────────────
  { id: '276790', name: 'Shuffle',      day: 'Wed', label: 'Wed Shuffle',       court: 'Court 1', hasPlayoffs: false },
  // ── Thursday ─────────────────────────────────────────────────────────────
  { id: '276788', name: 'Competitive',  day: 'Thu', label: 'Thu Competitive',  court: 'Court 1', hasPlayoffs: true  },
  { id: '276789', name: 'Recreational', day: 'Thu', label: 'Thu Recreational', court: 'Court 2', hasPlayoffs: true  },
];

export const UPCOMING_DIVISIONS: DivisionConfig[] = [
  // ── Monday ───────────────────────────────────────────────────────────────
  { id: '293497', name: '3v3 Coed',      day: 'Mon', label: 'Mon 3v3 Coed',      court: 'Court 1', hasPlayoffs: true  },
  // ── Tuesday ──────────────────────────────────────────────────────────────
  { id: '280407', name: 'Competitive',  day: 'Tue', label: 'Tue Competitive',  court: 'Court 1', hasPlayoffs: true  },
  { id: '280406', name: 'Recreational', day: 'Tue', label: 'Tue Recreational', court: 'Court 2', hasPlayoffs: true  },
  // ── Wednesday ────────────────────────────────────────────────────────────
  { id: '280410', name: 'Shuffle',      day: 'Wed', label: 'Wed Shuffle',       court: 'Court 1', hasPlayoffs: false },
  // ── Thursday ─────────────────────────────────────────────────────────────
  { id: '280408', name: 'Competitive',  day: 'Thu', label: 'Thu Competitive',  court: 'Court 1', hasPlayoffs: true  },
  { id: '280409', name: 'Recreational', day: 'Thu', label: 'Thu Recreational', court: 'Court 2', hasPlayoffs: true  },
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
