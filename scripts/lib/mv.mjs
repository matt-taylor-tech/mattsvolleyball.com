// Shared helpers for the Matt's Volleyball GroupMe automation scripts.
// Used by post-daily-schedule.mjs, post-results.mjs, and future posters.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEASON_CONFIG_PATH = path.resolve(__dirname, '../../src/lib/seasonConfig.ts');

export const ORG_ID = '10757';
export const API_BASE = 'https://app.mattsvolleyball.com/leagues';
export const EVENTS_API = `${API_BASE}/getAllEvents/${ORG_ID}`;
export const TIME_ZONE = 'America/New_York';
export const MAX_MESSAGE_CHARS = 950; // GroupMe hard limit is 1000; leave headroom

// Per-night conversation IDs. Mon/Tue/Thu are topics (subgroups) inside the
// league group (id 115950918); list them via GET /groups/115950918/subgroups
// with an access token. Wednesday is its own standalone group.
export const CONVERSATION_IDS = {
  Mon: '115954808', // topic
  Tue: '115954787', // topic
  Wed: '115951034', // standalone "Wednesday Shuffle | Matt's Volleyball" group
  Thu: '115954793', // topic
};

// "Bot Test Group" for development (issue #18): --test routes every post and
// event here. It has no topics, so all nights collapse to the group itself.
export const TEST_CONVERSATION_ID = '115965602';

// Nights excluded from ALL automated posts. Monday 3v3 was canceled for
// Summer Redux (not enough players); the site config intentionally still
// lists it, so the exclusion lives here in the automation layer only.
const DISABLED_DAYS = new Set(['Mon']);

// Days that get a calendar event (for RSVPs) instead of a schedule image.
// Shuffle night has one big roster, so there are no matchups worth posting;
// the event's Going list is the useful signal (RSVPs are optional; players
// can just show up, so the count is a forecast, not a commitment). Times are
// ET wall clock, reminders are seconds before start.
export const EVENT_DAYS = {
  Wed: {
    title: 'Wednesday Shuffle',           // becomes "Wednesday Shuffle - Jul 29"
    startTime: '18:45',
    endTime: '20:45',
    description: 'RSVP or show up by 6:30',
    location: { name: "Saeed's Bar & Grill", lat: 35.483712, lng: -80.868313 },
    reminders: [900], // 15 minutes before
  },
};

// Main league group ("Matt's Volleyball"): announcements that concern
// everyone, e.g. registration alerts.
export const MAIN_GROUP_ID = '115950918';

// ── Config parsing (mirrors check-teamlinkt-config.mjs) ──────────────────────

function extractSingleId(source, varName) {
  const re = new RegExp(`const\\s+${varName}\\s*=\\s*\\{[\\s\\S]*?id:\\s*'([0-9]+)'`, 'm');
  return source.match(re)?.[1] ?? null;
}

function extractDivisions(source, varName) {
  const blockRe = new RegExp(`const\\s+${varName}:[^=]*=\\s*\\[([\\s\\S]*?)\\];`, 'm');
  const block = source.match(blockRe)?.[1] ?? '';
  return [...block.matchAll(
    /\{\s*id:\s*'([0-9]+)',\s*name:\s*'([^']+)',\s*day:\s*'(\w+)'/g
  )].map((m) => ({
    id: m[1],
    name: m[2],
    day: m[3],
    // Shuffle-style divisions play one shared roster: no submitted scores, no
    // standings. (hasPlayoffs is NOT a reliable proxy: it only flips true once
    // playoff games are entered late in a season.)
    tracked: !/shuffle/i.test(m[2]),
  }));
}

/** Season/division config from src/lib/seasonConfig.ts, honoring the rollover date. */
export async function loadConfig() {
  const source = await readFile(SEASON_CONFIG_PATH, 'utf8');

  const currentSeasonId = extractSingleId(source, 'CURRENT_SEASON');
  const nextSeasonId = extractSingleId(source, 'NEXT_SEASON');
  const currentDivisions = extractDivisions(source, 'CURRENT_DIVISIONS');
  const upcomingDivisions = extractDivisions(source, 'UPCOMING_DIVISIONS');

  const rolloverDate = source.match(/export const ACTIVE_ROLLOVER_DATE = '([^']*)'/)?.[1] ?? '';
  const rolloverAt = new Date(rolloverDate);
  const hasRolledOver = !Number.isNaN(rolloverAt.getTime()) && new Date() >= rolloverAt;

  const playoffsActive = /export const PLAYOFFS_ACTIVE = true/.test(source) && !hasRolledOver;
  const playoffId = source.match(/export const PLAYOFF_ID = '([^']*)'/)?.[1] ?? '';

  const allDivisions = hasRolledOver ? upcomingDivisions : currentDivisions;
  const seasonId = hasRolledOver ? nextSeasonId : currentSeasonId;
  if (!seasonId || allDivisions.length === 0) {
    throw new Error('Unable to parse season/divisions from src/lib/seasonConfig.ts');
  }

  const divisions = allDivisions.filter((d) => !DISABLED_DAYS.has(d.day));
  return { seasonId, divisions, playoffsActive, playoffId };
}

/**
 * Registration-facing config for the UPCOMING season, regardless of rollover:
 * divisions (minus disabled days), season id/label, and the two cap maps.
 */
export async function loadUpcomingConfig() {
  const source = await readFile(SEASON_CONFIG_PATH, 'utf8');

  const seasonId = extractSingleId(source, 'NEXT_SEASON');
  const seasonLabel = source.match(/const NEXT_SEASON = \{[\s\S]*?label: '([^']+)'/)?.[1] ?? '';
  const divisions = extractDivisions(source, 'UPCOMING_DIVISIONS')
    .filter((d) => !DISABLED_DAYS.has(d.day));
  if (!seasonId || divisions.length === 0) {
    throw new Error('Unable to parse upcoming season/divisions from src/lib/seasonConfig.ts');
  }

  const parseCapMap = (varName) => {
    const block = source.match(new RegExp(`export const ${varName}[^{]*\\{([\\s\\S]*?)\\};`))?.[1] ?? '';
    return Object.fromEntries([...block.matchAll(/'(\d+)':\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]));
  };

  return {
    seasonId,
    seasonLabel,
    divisions,
    maxTeams: parseCapMap('UPCOMING_MAX_TEAMS_BY_DIVISION'),
    playerCaps: parseCapMap('UPCOMING_PLAYER_CAPS_BY_DIVISION'),
  };
}

// ── Date helpers (all ET-aware) ───────────────────────────────────────────────

/** YYYY-MM-DD for a Date, in ET. */
export function etDateKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export function utcNoonFor(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

/** Day-of-week key (Mon/Tue/...) for a YYYY-MM-DD calendar date. */
export function dayKeyFor(dateKey) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][utcNoonFor(dateKey).getUTCDay()];
}

/** "Tue, Jul 14" style label. */
export function dateLabelFor(dateKey) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric',
  }).format(utcNoonFor(dateKey));
}

/** "Jul 29" style label. */
export function shortDateLabelFor(dateKey) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric',
  }).format(utcNoonFor(dateKey));
}

/** UTC offset ("-04:00" / "-05:00") of the ET zone on the given date, DST-aware. */
export function etOffsetFor(dateKey) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, timeZoneName: 'longOffset' })
    .formatToParts(utcNoonFor(dateKey))
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  return name.replace('GMT', '') || '+00:00';
}

/** YYYY-MM-DD of the day before the given date key. */
export function previousDateKey(dateKey) {
  const d = utcNoonFor(dateKey);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ── TeamLinkt fetching ────────────────────────────────────────────────────────

export async function postForm(url, params) {
  const res = await fetch(url, { method: 'POST', body: new URLSearchParams(params) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

/**
 * Extract display text from a TeamLinkt team/location HTML cell.
 * Mirrors stripHtml() in schedule.astro: prefer the tooltip span's
 * data-original-title, else the tag-stripped inner text.
 */
export function cellText(html) {
  if (!html) return '';
  const tooltip = html.match(/class="tooltips"[^>]*data-original-title="([^"]*)"[^>]*>([^<]*)</);
  if (tooltip) return (tooltip[1] || tooltip[2]).trim();
  return html.replace(/<[^>]*>/g, '').trim();
}

/** Trailing "(N)" games-won marker in a scored game's team cell. */
function winsIn(cellHtml) {
  const m = (cellHtml || '').match(/\((\d+)\)<\/span>\s*$/);
  return m ? Number(m[1]) : null;
}

/** Set scores embedded as a showVolleyballSetScores([...]) call in the game cell. */
function setsIn(cellHtml) {
  const m = (cellHtml || '').match(/showVolleyballSetScores\((\[[^\]]*\])/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]); // [{name, home, away}, ...]
  } catch {
    return null;
  }
}

/**
 * A division's played games on a date, with submitted scores where present:
 * [{home, away, homeWins, awayWins, sets, timestamp}]. homeWins/awayWins are
 * null when no score was submitted.
 */
export async function fetchResults(divisionId, dateKey) {
  const json = await postForm(EVENTS_API, {
    start: '0', length: '100', status: 'past',
    type: 'scores', show_games_only: '1',
    [`filters[${divisionId}]`]: divisionId,
  });
  return (json.data || [])
    .filter((row) => etDateKey(new Date(Number(row['6']) * 1000)) === dateKey)
    .map((row) => ({
      home: cellText(row['3']),
      away: cellText(row['4']),
      homeWins: winsIn(row['3']),
      awayWins: winsIn(row['4']),
      sets: setsIn(row['2']),
      timestamp: Number(row['6']),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

/** True if any of the day's divisions has a TeamLinkt game on the date. */
export async function hasGamesOn(config, dayKey, dateKey) {
  for (const division of config.divisions.filter((d) => d.day === dayKey)) {
    const json = await postForm(EVENTS_API, {
      start: '0', length: '100', status: 'upcoming',
      [`filters[${division.id}]`]: division.id,
    });
    const todays = (json.data || []).filter(
      (row) => etDateKey(new Date(Number(row['6']) * 1000)) === dateKey,
    );
    if (todays.length > 0) return true;
  }
  return false;
}

/** Division standings: [{rank, name, wins, losses, points}] sorted by rank. */
export async function fetchStandings(divisionId, seasonId) {
  const json = await postForm(`${API_BASE}/getStandings/${ORG_ID}/${seasonId}`, {
    'group_ids[division]': divisionId,
    season_id: seasonId,
  });
  return (json.standings || [])
    .map((s) => ({
      rank: s.ranking,
      name: s.Team?.name || cellText(s.team_name),
      wins: s.total_wins,
      losses: s.total_losses,
      points: s.total_points,
    }))
    .sort((a, b) => a.rank - b.rank);
}

// ── Text formatting ───────────────────────────────────────────────────────────

const BOLD_DIGITS = [...'𝟬𝟭𝟮𝟯𝟰𝟱𝟲𝟳𝟴𝟵'];
const BOLD_UPPER = [...'𝗔𝗕𝗖𝗗𝗘𝗙𝗚𝗛𝗜𝗝𝗞𝗟𝗠𝗡𝗢𝗣𝗤𝗥𝗦𝗧𝗨𝗩𝗪𝗫𝗬𝗭'];
const BOLD_LOWER = [...'𝗮𝗯𝗰𝗱𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝘅𝘆𝘇'];

/** Fake bold via Unicode sans-serif bold (letters/digits only; punctuation unchanged). */
export function boldSans(text) {
  return [...text].map((ch) => {
    if (ch >= '0' && ch <= '9') return BOLD_DIGITS[ch.charCodeAt(0) - 48];
    if (ch >= 'A' && ch <= 'Z') return BOLD_UPPER[ch.charCodeAt(0) - 65];
    if (ch >= 'a' && ch <= 'z') return BOLD_LOWER[ch.charCodeAt(0) - 97];
    return ch;
  }).join('');
}

export const PLACEHOLDER_TEAMS = new Set(['', 'TBD', 'Pending Team']);

/**
 * Greedy-pack sections into messages under the GroupMe character limit.
 * The header leads the first message; the footer trails the last (on its own
 * message if it doesn't fit). No URLs in any of it: link previews clutter posts.
 */
export function packMessages(header, sections, footer, max = MAX_MESSAGE_CHARS) {
  const messages = [];
  let current = header;
  for (const section of sections) {
    const candidate = `${current}\n\n${section}`;
    if (candidate.length > max && current !== header) {
      messages.push(current);
      current = section;
    } else {
      current = candidate;
    }
  }
  if (`${current}\n\n${footer}`.length <= max) {
    messages.push(`${current}\n\n${footer}`);
  } else {
    messages.push(current, footer);
  }
  return messages;
}

// ── GroupMe ───────────────────────────────────────────────────────────────────

/** Upload a PNG to GroupMe's image service; returns the attachment URL. */
export async function uploadImage(token, buffer) {
  const res = await fetch('https://image.groupme.com/pictures', {
    method: 'POST',
    headers: { 'X-Access-Token': token, 'Content-Type': 'image/png' },
    body: buffer,
  });
  if (!res.ok) {
    throw new Error(`GroupMe image upload failed: HTTP ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  const url = json?.payload?.url;
  if (!url) throw new Error('GroupMe image upload returned no URL');
  await waitForImageReady(url);
  return url;
}

/**
 * The image service generates the mobile-sized variants (.preview/.large)
 * asynchronously after upload. A message posted before they exist renders on
 * web (which falls back to the original) but stays permanently imageless in
 * the mobile apps. Wait for the .preview variant plus a short settle delay.
 */
async function waitForImageReady(url, timeoutMs = 30000) {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${url}.preview`, { method: 'HEAD' });
    if (res.ok) return;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Image variants still not ready after ${timeoutMs}ms: ${url}`);
}

/** Post into a topic/group as the token's user: the bot API can't reach topics. */
export async function postToTopic(token, topicId, text, imageUrl, sourceGuid) {
  const message = { source_guid: sourceGuid, text };
  if (imageUrl) message.attachments = [{ type: 'image', url: imageUrl }];
  const res = await fetch(`https://api.groupme.com/v3/groups/${topicId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Access-Token': token },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    throw new Error(`GroupMe topic post failed: HTTP ${res.status} ${await res.text()}`);
  }
}

export async function postAsBot(botId, text, imageUrl) {
  const body = { bot_id: botId, text };
  if (imageUrl) body.picture_url = imageUrl;
  const res = await fetch('https://api.groupme.com/v3/bots/post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`GroupMe bot post failed: HTTP ${res.status} ${await res.text()}`);
  }
}

/**
 * Create a calendar event in a topic/group (undocumented endpoint). GroupMe
 * auto-posts an event card message in the conversation, so no separate post
 * needed. Skips creation if a live (not soft-deleted) event with the same
 * name exists.
 */
/** Live (not soft-deleted) calendar events in a conversation. */
export async function listTopicEvents(token, topicId) {
  const res = await fetch(
    `https://api.groupme.com/v3/conversations/${topicId}/events/list?limit=50`,
    { headers: { 'X-Access-Token': token } },
  );
  if (!res.ok) throw new Error(`GroupMe event list failed: HTTP ${res.status}`);
  return ((await res.json())?.response?.events ?? []).filter((e) => !e.deleted_at);
}

export async function createTopicEvent(token, topicId, name, cfg, startAt, endAt) {
  try {
    const existing = await listTopicEvents(token, topicId);
    if (existing.some((e) => e.name === name)) {
      return false; // already created (deletes are soft; deleted_at marks them)
    }
  } catch {
    // If the list is unavailable, fall through and attempt creation anyway.
  }

  const res = await fetch(`https://api.groupme.com/v3/conversations/${topicId}/events/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Access-Token': token },
    body: JSON.stringify({
      name,
      description: cfg.description,
      location: cfg.location,
      reminders: cfg.reminders,
      start_at: startAt,
      end_at: endAt,
      is_all_day: false,
      timezone: TIME_ZONE,
    }),
  });
  if (!res.ok) {
    throw new Error(`GroupMe event create failed: HTTP ${res.status} ${await res.text()}`);
  }
  return true;
}
