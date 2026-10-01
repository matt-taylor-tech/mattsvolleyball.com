// Builds a team's iCalendar feed from TeamLinkt event rows. Served by
// functions/calendar/[team].ts; calendar apps subscribe to it and re-fetch it,
// so a rescheduled game moves rather than going stale.
//
// No DOM here (it runs in a Pages Function), so TeamLinkt's HTML cells are
// parsed with the same regexes as cellText() in scripts/lib/mv.mjs.

export type EventRow = Record<string, string | number>;

const DEFAULT_GAME_MINUTES = 55;

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Display text of a TeamLinkt team/location cell (mirrors cellText in scripts/lib/mv.mjs). */
export function cellText(html: unknown): string {
  const s = String(html ?? '');
  const tooltip = s.match(/class="tooltips"[^>]*data-original-title="([^"]*)"[^>]*>([^<]*)</);
  const text = tooltip ? (tooltip[1] || tooltip[2]) : s.replace(/<[^>]*>/g, '');
  return decodeEntities(text).trim();
}

/** Minutes after midnight for '6:30 PM'. */
function clockMinutes(t: string): number | null {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!m) return null;
  return ((Number(m[1]) % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(m[2]);
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** 'YYYYMMDDTHHMMSS' for a naive (wall-clock) Date built with Date.UTC. */
function icsLocal(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '');
}

/**
 * Eastern wall-clock start/end from the date cell ('Thu Oct 1, 2026') and time
 * cell ('6:30 PM - 7:25 PM'). Row '6' (the unix timestamp) can't be used: it
 * comes back hours off from the time TeamLinkt displays, so the displayed
 * Eastern times are the source of truth.
 */
function gameTimes(dateCell: string, timeCell: string): { start: string; end: string } | null {
  const d = dateCell.match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})/);
  const month = d ? MONTHS[d[1].toLowerCase()] : undefined;
  const [startMin, endMin] = timeCell.split(' - ').map(clockMinutes);
  if (!d || month === undefined || startMin == null) return null;
  const minutes = endMin != null && endMin > startMin ? endMin - startMin : DEFAULT_GAME_MINUTES;
  const start = new Date(Date.UTC(Number(d[3]), month, Number(d[2]), 0, startMin));
  const end = new Date(start.getTime() + minutes * 60_000);
  return { start: icsLocal(start), end: icsLocal(end) };
}

interface Game {
  uid: string;
  sortKey: number; // unix seconds, for ordering only
  start: string; // Eastern wall clock, 'YYYYMMDDTHHMMSS'
  end: string;
  home: string;
  away: string;
  homeId: number;
  awayId: number;
  location: string;
  geo: string | null; // 'lat;lng'
  summaryUrl: string;
}

function parseRow(row: EventRow): Game | null {
  const times = gameTimes(String(row['0'] ?? ''), String(row['1'] ?? ''));
  if (!times) return null;
  const sortKey = Number(row['6']) || 0;
  const homeId = Number(row.home_association_team_id);
  const awayId = Number(row.away_assocation_team_id);
  const gameCell = String(row['2'] ?? '');
  const eventId = gameCell.match(/\/event\/\d+\/(\d+)/)?.[1];
  const locationCell = String(row['5'] ?? '');
  const geo = locationCell.match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  return {
    // Stable across schedule edits, so a moved game updates in place.
    uid: `${eventId ?? `${times.start}-${homeId}-${awayId}`}@mattsvolleyball.com`,
    sortKey,
    ...times,
    home: cellText(row['3']),
    away: cellText(row['4']),
    homeId,
    awayId,
    location: cellText(locationCell),
    geo: geo ? `${geo[1]};${geo[2]}` : null,
    summaryUrl: gameCell.match(/href="([^"]+)"/)?.[1]?.replace(/\\\//g, '/') ?? '',
  };
}

/** RFC 5545 TEXT escaping. */
function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function icsUtc(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// US Eastern rules since 2007, required by RFC 5545 for TZID references.
const NEW_YORK_VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:America/New_York',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0500',
  'TZOFFSETTO:-0400',
  'TZNAME:EDT',
  'DTSTART:20070311T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0400',
  'TZOFFSETTO:-0500',
  'TZNAME:EST',
  'DTSTART:20071104T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

/** Fold to 75-octet lines without splitting a UTF-8 character. */
function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + n > limit) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/**
 * Feed for one team. `rows` may mix upcoming and past games and other teams'
 * games; only games involving `teamId` are kept, deduplicated by uid.
 */
export function buildTeamCalendar(teamId: number, rows: EventRow[], siteUrl: string, now = new Date()): string {
  const games = new Map<string, Game>();
  for (const row of rows) {
    const g = parseRow(row);
    if (g && (g.homeId === teamId || g.awayId === teamId)) games.set(g.uid, g);
  }
  const sorted = [...games.values()].sort((a, b) => a.sortKey - b.sortKey);
  const first = sorted[0];
  const teamName = first ? (first.homeId === teamId ? first.home : first.away) : '';
  const calName = teamName ? `${teamName} · Matt's Volleyball` : "Matt's Volleyball";
  const teamPage = `${siteUrl}/leagues/team/?id=${teamId}${teamName ? `&name=${encodeURIComponent(teamName)}` : ''}`;
  const stamp = icsUtc(Math.floor(now.getTime() / 1000));

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    "PRODID:-//Matt's Volleyball//Team Schedule//EN",
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(calName)}`,
    'X-WR-TIMEZONE:America/New_York',
    // Refresh hints; Apple honors them, Google polls on its own schedule.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...NEW_YORK_VTIMEZONE,
  ];
  for (const g of sorted) {
    const isHome = g.homeId === teamId;
    const opponent = isHome ? g.away : g.home;
    const description = [
      `${g.home} vs ${g.away}`,
      g.location,
      `Team schedule: ${teamPage}`,
      g.summaryUrl ? `Game summary: ${g.summaryUrl}` : '',
    ].filter(Boolean).join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${g.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=America/New_York:${g.start}`,
      `DTEND;TZID=America/New_York:${g.end}`,
      `SUMMARY:${icsText(`🏐 ${isHome ? 'vs' : '@'} ${opponent || 'TBD'}`)}`,
      `LOCATION:${icsText(g.location)}`,
      ...(g.geo ? [`GEO:${g.geo}`] : []),
      `DESCRIPTION:${icsText(description)}`,
      `URL:${teamPage}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
