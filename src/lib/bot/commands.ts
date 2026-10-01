// Parses GroupMe messages into bot commands and builds the replies.
//
// Anyone:      !schedule [day]   !standings [day]   !spots   !help
// Admins only, in the control group: RAINOUT[: message]   GAMES ON[: message]
//              CLEAR   STATUS   HELP (also lists these admin commands)
//
// Admin commands work with or without a leading "!", so they can be typed the
// way the call would be written anyway ("RAINOUT: Thursday is canceled").

import { etNowString, DAY_FULL_LABEL } from '../seasonConfig';
import type { SiteStatusKind } from './siteStatus';
import { fetchNextNightGames, fetchDivisionStandings, divisionsForDay, fetchSpots, activeDays } from './teamlinkt';
import { packMessages } from './groupme';

export type Command =
  | { type: 'schedule'; day?: string }
  | { type: 'standings'; day?: string }
  | { type: 'spots' }
  | { type: 'help'; admin?: boolean }
  | { type: 'show-status' }
  | { type: 'status'; kind: SiteStatusKind; message: string; day?: string }
  | { type: 'clear' };

const DAY_WORDS: Record<string, string> = {
  mon: 'Mon', monday: 'Mon',
  tue: 'Tue', tues: 'Tue', tuesday: 'Tue',
  wed: 'Wed', weds: 'Wed', wednesday: 'Wed',
  thu: 'Thu', thur: 'Thu', thurs: 'Thu', thursday: 'Thu',
};

/** First weekday named in the text ('Thursday games...' -> 'Thu'). */
export function findDay(text: string): string | undefined {
  for (const word of text.toLowerCase().match(/[a-z]+/g) ?? []) {
    if (DAY_WORDS[word]) return DAY_WORDS[word];
  }
  return undefined;
}

const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Today's weekday key in Eastern time ('Tue'). */
export function etToday(now: Date = new Date()): string {
  const [date] = etNowString(now).split(' ');
  const [y, m, d] = date.split('-').map(Number);
  return WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** Admin-only commands; null if the message isn't one. */
function parseAdmin(text: string): Command | null {
  const t = text.trim();
  if (/^!?(help|commands)\s*$/i.test(t)) return { type: 'help', admin: true };
  if (/^!?status\s*$/i.test(t)) return { type: 'show-status' };
  if (/^!?clear\s*$/i.test(t) || /^!?rainout\s+clear\s*$/i.test(t)) return { type: 'clear' };
  const rainout = t.match(/^!?rain\s?out\b[\s:.\-–—]*([\s\S]*)$/i);
  if (rainout) return { type: 'status', kind: 'rainout', message: rainout[1].trim(), day: findDay(rainout[1]) };
  const on = t.match(/^!?games?\s+(?:are\s+)?on\b[\s:.!\-–—]*([\s\S]*)$/i);
  if (on) return { type: 'status', kind: 'games-on', message: on[1].trim(), day: findDay(on[1]) };
  return null;
}

/** Commands anyone can use; null if the message isn't one. */
function parsePublic(text: string): Command | null {
  const m = text.trim().match(/^!(\w+)\s*(.*)$/);
  if (!m) return null;
  const arg = m[2] ? findDay(m[2]) : undefined;
  switch (m[1].toLowerCase()) {
    case 'schedule': case 'games': return { type: 'schedule', day: arg };
    case 'standings': return { type: 'standings', day: arg };
    case 'spots': return { type: 'spots' };
    case 'help': case 'commands': return { type: 'help' };
    default: return null;
  }
}

export function parseCommand(text: string, isAdmin: boolean): Command | null {
  if (!text) return null;
  return (isAdmin && parseAdmin(text)) || parsePublic(text);
}

const dayName = (day: string) => DAY_FULL_LABEL[day] ?? day;

// Stand-in team names TeamLinkt uses (mirrors PLACEHOLDER_TEAMS in scripts/lib/mv.mjs).
const PLACEHOLDER_TEAMS = new Set(['', 'TBD', 'Pending Team']);

/** Today if it's a league night, else the next one this week (wrapping). */
function nextLeagueDay(today: string): string | undefined {
  const start = WEEK.indexOf(today);
  const days = activeDays();
  for (let i = 0; i < 7; i++) {
    const day = WEEK[(start + i) % 7];
    if (days.includes(day)) return day;
  }
  return undefined;
}

/** Banner text for a status command, with a default when no message is given. */
export function statusWording(kind: SiteStatusKind, message: string, day: string) {
  const banner = message || (kind === 'rainout'
    ? `${dayName(day)} games are canceled tonight due to weather.`
    : `${dayName(day)} games are on tonight!`);
  return { banner };
}

export const HELP_TEXT = [
  "🏐 Matt's Volleyball bot",
  '!schedule [day]: next game night (e.g. !schedule thu)',
  '!standings [day]: current standings',
  '!spots: open spots for registration',
].join('\n');

/** Help in the control group: the banner commands, then the public ones. */
export const ADMIN_HELP_TEXT = [
  '🛠️ Site banner (this group only, nothing is posted to players)',
  'RAINOUT: <message>  red banner, e.g. RAINOUT: Thursday games are canceled tonight',
  'GAMES ON: <message>  green banner',
  'CLEAR  remove the banner',
  'STATUS  show what the site says right now',
  'Banners come down on their own at 4 AM.',
  '',
  HELP_TEXT,
].join('\n');

/** Replies for the read-only commands. Admin commands are handled by the callback. */
export async function replyFor(cmd: Command, now: Date = new Date()): Promise<string[]> {
  switch (cmd.type) {
    case 'help':
      return [cmd.admin ? ADMIN_HELP_TEXT : HELP_TEXT];

    case 'schedule': {
      const day = cmd.day ?? nextLeagueDay(etToday(now));
      if (!day) return ['No league nights this season.'];
      const next = await fetchNextNightGames(day);
      if (!next || next.games.length === 0) return [`No ${dayName(day)} games on the schedule.`];
      const dateLabel = next.date.replace(/,\s*\d{4}$/, '');
      // Shuffle night is one big roster against a placeholder, not matchups.
      const games = next.games.filter((g) => !PLACEHOLDER_TEAMS.has(g.home) && !PLACEHOLDER_TEAMS.has(g.away));
      if (games.length === 0) {
        return [`🏐 ${dateLabel}: ${dayName(day)} Shuffle at ${next.games[0].time}. Teams are made on the spot, so just show up.`];
      }
      const byTime = new Map<string, string[]>();
      for (const g of games) {
        const line = `• ${g.court}: ${g.home} vs ${g.away}`;
        byTime.set(g.time, [...(byTime.get(g.time) ?? []), line]);
      }
      const sections = [...byTime].map(([time, lines]) => `${time}\n${lines.join('\n')}`);
      return packMessages([`🏐 ${dateLabel}`, ...sections]);
    }

    case 'standings': {
      const divisions = divisionsForDay(cmd.day);
      if (divisions.length === 0) return [`No ${dayName(cmd.day!)} divisions this season.`];
      const tables = await Promise.all(divisions.map(async (d) => {
        const rows = await fetchDivisionStandings(d.id);
        const lines = rows.map((r) => `${r.rank}. ${r.name} (${r.wins}-${r.losses})`);
        return `${d.label}\n${lines.join('\n') || 'No teams yet.'}`;
      }));
      return packMessages(['🏆 Standings', ...tables]);
    }

    case 'spots': {
      const lines = await fetchSpots();
      if (lines.length === 0) return ["Couldn't load registration numbers right now."];
      return [[
        '📝 Spots left',
        ...lines.map((l) => {
          const left = Math.max(0, l.max - l.count);
          return left === 0
            ? `${l.label}: full${l.unit === 'players' ? ' (waitlist open)' : ' (join an existing team)'}`
            : `${l.label}: ${left} of ${l.max} ${l.unit === 'players' ? 'player' : 'team'} spot${left === 1 ? '' : 's'} left`;
        }),
      ].join('\n')];
    }

    default:
      return [];
  }
}
