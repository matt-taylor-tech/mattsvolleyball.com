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

// ── Active Season (schedule / standings / scores / teams / playoffs) ─────────
export const ACTIVE_SEASON_ID = '51955'; // Spring 2026
export const ACTIVE_SEASON_LABEL = 'Spring 2026';

// ── Upcoming Season (promotion / registration) ───────────────────────────────
export const UPCOMING_SEASON_ID = '52672'; // Summer I 2026
export const UPCOMING_SEASON_LABEL = 'Summer I 2026';

// ── Division definitions ─────────────────────────────────────────────────────
export interface DivisionConfig {
  id: string;
  name: string;       // short name shown in tabs / brackets ("Competitive", "Shuffle" …)
  day: string;        // day key matching TeamLinkt date prefix: 'Mon' | 'Tue' | 'Wed' | 'Thu'
  label: string;      // full tab label ("Mon 3v3 Coed", "Tue Competitive" …)
  court: string;      // court assignment for playoffs page
  hasPlayoffs: boolean;
}

export const ACTIVE_DIVISIONS: DivisionConfig[] = [
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

export const EVENTS_API    = `${API_BASE}/getAllEvents/${ORG_ID}`;
export const TEAMS_API_URL = `${API_BASE}/getTeams/${ORG_ID}/${ACTIVE_SEASON_ID}`;
export const STANDINGS_API_URL = `${API_BASE}/getStandings/${ORG_ID}/${ACTIVE_SEASON_ID}`;
