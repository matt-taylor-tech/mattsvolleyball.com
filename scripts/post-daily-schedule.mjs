// Posts today's schedule to the matching night's GroupMe topic.
//
// Primary: screenshots today's section of the live schedule page with
// Playwright, uploads it to GroupMe's image service, and posts it with a
// short caption (date + bot notice; deliberately no URLs, since GroupMe
// link previews clutter image posts).
// Fallback: if the screenshot fails, posts a text version instead: games
// grouped by time, fake-bold (Unicode sans-bold) times and team names.
//
// Season/division config comes from src/lib/seasonConfig.ts (regex-parsed,
// same approach as check-teamlinkt-config.mjs).
//
// Env:  GROUPME_TOKEN    user access token: required (image upload + posting
//                        into topics; bots get 401 on topic IDs)
//       GROUPME_BOT_ID   optional fallback: bot post to the group's main chat
//                        (used only if the day has no topic mapped)
// Args: --dry-run           save the screenshot locally and print the caption
//       --date=YYYY-MM-DD   override "today" (interpreted as an ET calendar date)
//       --text              skip the screenshot and use the text format (for testing)
//
// Exits 0 (silently, no post) on non-league days and days with no games.
// Exits 1 on config, fetch, capture, or GroupMe errors so the Actions run shows red.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SEASON_CONFIG_PATH = path.resolve(__dirname, '../src/lib/seasonConfig.ts');

const ORG_ID = '10757';
const API_BASE = 'https://app.mattsvolleyball.com/leagues';
const EVENTS_API = `${API_BASE}/getAllEvents/${ORG_ID}`;
const SCHEDULE_URL = 'https://mattsvolleyball.com/leagues/schedule';
const GROUPME_BOT_POST_API = 'https://api.groupme.com/v3/bots/post';
const GROUPME_IMAGE_API = 'https://image.groupme.com/pictures';
const TIME_ZONE = 'America/New_York';
const MAX_MESSAGE_CHARS = 950; // GroupMe hard limit is 1000; leave headroom

// Per-night conversation IDs. Mon/Tue/Thu are topics (subgroups) inside the
// league group (id 115950918); list them via GET /groups/115950918/subgroups
// with an access token. Wednesday is its own standalone group with its own
// bot (secret GROUPME_BOT_ID_WED, currently unused: Wednesday only creates
// events, which go through the user token).
const CONVERSATION_IDS = {
  Mon: '115954808', // topic
  Tue: '115954787', // topic
  Wed: '115951034', // standalone "Wednesday Shuffle | Matt's Volleyball" group
  Thu: '115954793', // topic
};

// Days that get a calendar event (for RSVPs) instead of a schedule image.
// Shuffle night has one big roster, so there are no matchups worth posting;
// the event's Going list is the useful signal. Times are ET wall clock,
// reminders are seconds before start.
const EVENT_DAYS = {
  Wed: {
    title: 'Wednesday Shuffle',           // becomes "Wednesday Shuffle - Jul 29"
    startTime: '18:45',
    endTime: '20:45',
    description: 'RSVP or show up by 6:30',
    location: { name: "Saeed's Bar & Grill", lat: 35.483712, lng: -80.868313 },
    reminders: [900], // 15 minutes before
  },
};

// ── Config parsing (mirrors check-teamlinkt-config.mjs) ──────────────────────

function extractDivisions(source, varName) {
  const blockRe = new RegExp(`const\\s+${varName}:[^=]*=\\s*\\[([\\s\\S]*?)\\];`, 'm');
  const block = source.match(blockRe)?.[1] ?? '';
  return [...block.matchAll(
    /\{\s*id:\s*'([0-9]+)',\s*name:\s*'([^']+)',\s*day:\s*'(\w+)'/g
  )].map((m) => ({ id: m[1], name: m[2], day: m[3] }));
}

async function loadConfig() {
  const source = await readFile(SEASON_CONFIG_PATH, 'utf8');

  const currentDivisions = extractDivisions(source, 'CURRENT_DIVISIONS');
  const upcomingDivisions = extractDivisions(source, 'UPCOMING_DIVISIONS');

  const rolloverDate = source.match(/export const ACTIVE_ROLLOVER_DATE = '([^']*)'/)?.[1] ?? '';
  const rolloverAt = new Date(rolloverDate);
  const hasRolledOver = !Number.isNaN(rolloverAt.getTime()) && new Date() >= rolloverAt;

  const playoffsActive = /export const PLAYOFFS_ACTIVE = true/.test(source) && !hasRolledOver;
  const playoffId = source.match(/export const PLAYOFF_ID = '([^']*)'/)?.[1] ?? '';

  const divisions = hasRolledOver ? upcomingDivisions : currentDivisions;
  if (divisions.length === 0) {
    throw new Error('Unable to parse divisions from src/lib/seasonConfig.ts');
  }

  return { divisions, playoffsActive, playoffId };
}

// ── Date helpers ──────────────────────────────────────────────────────────────

/** YYYY-MM-DD for a Date, in ET. */
function etDateKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

function utcNoonFor(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

/** Day-of-week key (Mon/Tue/...) for a YYYY-MM-DD calendar date. */
function dayKeyFor(dateKey) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][utcNoonFor(dateKey).getUTCDay()];
}

/** "Tue, Jul 14" style label for the caption. */
function dateLabelFor(dateKey) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric',
  }).format(utcNoonFor(dateKey));
}

/** "Jul 29" style label for event names. */
function shortDateLabelFor(dateKey) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric',
  }).format(utcNoonFor(dateKey));
}

/** UTC offset ("-04:00" / "-05:00") of the ET zone on the given date, DST-aware. */
function etOffsetFor(dateKey) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, timeZoneName: 'longOffset' })
    .formatToParts(utcNoonFor(dateKey))
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  return name.replace('GMT', '') || '+00:00';
}

/** "Tue Jul 14, 2026": matches the date headings TeamLinkt data renders on the schedule page. */
function pageDateHeadingFor(dateKey) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  }).formatToParts(utcNoonFor(dateKey));
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('weekday')} ${get('month')} ${get('day')}, ${get('year')}`;
}

// ── TeamLinkt fetching ────────────────────────────────────────────────────────

async function postForm(url, params) {
  const res = await fetch(url, { method: 'POST', body: new URLSearchParams(params) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

/**
 * Extract display text from a TeamLinkt team/location HTML cell.
 * Mirrors stripHtml() in schedule.astro: prefer the tooltip span's
 * data-original-title, else the tag-stripped inner text.
 */
function cellText(html) {
  if (!html) return '';
  const tooltip = html.match(/class="tooltips"[^>]*data-original-title="([^"]*)"[^>]*>([^<]*)</);
  if (tooltip) return (tooltip[1] || tooltip[2]).trim();
  return html.replace(/<[^>]*>/g, '').trim();
}

function parseGameRows(rows, dateKey) {
  return (rows || [])
    .filter((row) => etDateKey(new Date(Number(row['6']) * 1000)) === dateKey)
    .map((row) => {
      const location = cellText(row['5']);
      return {
        time: String(row['1']).split(' - ')[0].trim(),
        home: cellText(row['3']),
        away: cellText(row['4']),
        court: location.match(/Court\s*\d+/i)?.[0] ?? location,
        timestamp: Number(row['6']),
      };
    });
}

/** Today's games across tonight's divisions (playoff games included by TeamLinkt). */
async function fetchGamesToday(config, todayDivisions, dateKey) {
  const games = [];
  for (const division of todayDivisions) {
    const json = await postForm(EVENTS_API, {
      start: '0', length: '100', status: 'upcoming',
      [`filters[${division.id}]`]: division.id,
    });
    games.push(...parseGameRows(json.data, dateKey));
  }
  if (games.length === 0 && config.playoffsActive && config.playoffId) {
    const json = await postForm(EVENTS_API, {
      start: '0', length: '200', status: 'upcoming',
      schedule_type: 'playoffs', playoff_id: config.playoffId,
    });
    games.push(...parseGameRows(json.data, dateKey));
  }
  return games.sort((a, b) => a.timestamp - b.timestamp || a.court.localeCompare(b.court));
}

// ── Text fallback formatting ──────────────────────────────────────────────────

const BOLD_DIGITS = [...'𝟬𝟭𝟮𝟯𝟰𝟱𝟲𝟳𝟴𝟵'];
const BOLD_UPPER = [...'𝗔𝗕𝗖𝗗𝗘𝗙𝗚𝗛𝗜𝗝𝗞𝗟𝗠𝗡𝗢𝗣𝗤𝗥𝗦𝗧𝗨𝗩𝗪𝗫𝗬𝗭'];
const BOLD_LOWER = [...'𝗮𝗯𝗰𝗱𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝘅𝘆𝘇'];

/** Fake bold via Unicode sans-serif bold (letters/digits only; punctuation unchanged). */
function boldSans(text) {
  return [...text].map((ch) => {
    if (ch >= '0' && ch <= '9') return BOLD_DIGITS[ch.charCodeAt(0) - 48];
    if (ch >= 'A' && ch <= 'Z') return BOLD_UPPER[ch.charCodeAt(0) - 65];
    if (ch >= 'a' && ch <= 'z') return BOLD_LOWER[ch.charCodeAt(0) - 97];
    return ch;
  }).join('');
}

const PLACEHOLDER_TEAMS = new Set(['', 'TBD', 'Pending Team']);

function fallbackGameLine(game) {
  const home = PLACEHOLDER_TEAMS.has(game.home) ? 'TBD' : boldSans(game.home);
  const away = PLACEHOLDER_TEAMS.has(game.away) ? 'TBD' : boldSans(game.away);
  return `${game.court} · ${home} vs ${away}`;
}

/** Variant-B style text: ⏰ bold time, heavy divider, bold team names. */
function buildFallbackMessages(dateKey, games) {
  const header = `🏐 Tonight's schedule - ${dateLabelFor(dateKey)}`;
  const footer = `🤖 Auto-posted by Matt's bot`; // no URL: avoids link previews

  const times = [...new Set(games.map((g) => g.time))];
  const sections = times.map((t) => {
    const lines = games.filter((g) => g.time === t).map(fallbackGameLine);
    return `⏰ ${boldSans(t)}\n━━━━━━━━━━━━━\n${lines.join('\n')}`;
  });

  // Greedy-pack sections into messages under the GroupMe character limit.
  const messages = [];
  let current = header;
  for (const section of sections) {
    const candidate = `${current}\n\n${section}`;
    if (candidate.length > MAX_MESSAGE_CHARS && current !== header) {
      messages.push(current);
      current = section;
    } else {
      current = candidate;
    }
  }
  if (`${current}\n\n${footer}`.length <= MAX_MESSAGE_CHARS) {
    messages.push(`${current}\n\n${footer}`);
  } else {
    messages.push(current, footer);
  }
  return messages;
}

// ── Screenshot ────────────────────────────────────────────────────────────────

async function captureScheduleImage(dateKey) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 480, height: 1400 },
      deviceScaleFactor: 2,
      timezoneId: TIME_ZONE, // the page computes "today" in browser-local time
    });
    await page.goto(SCHEDULE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#schedule-container > div', { timeout: 45000 });

    const heading = pageDateHeadingFor(dateKey);
    const group = page
      .locator('#schedule-container > div')
      .filter({ has: page.locator('h3', { hasText: heading }) })
      .first();
    if ((await group.count()) === 0) {
      throw new Error(`No "${heading}" section found on the schedule page`);
    }

    // Hide the other date sections so the margin below is clean background
    // instead of the next date's heading bleeding in.
    await group.evaluate((el) => {
      for (const sibling of el.parentElement.children) {
        if (sibling !== el) sibling.style.display = 'none';
      }
    });

    // Clip an expanded box around the section so the page background
    // becomes a comfortable margin (a touch extra on the bottom).
    await group.scrollIntoViewIfNeeded();
    const box = await group.boundingBox();
    if (!box) throw new Error('Could not measure the schedule section');
    const margin = { top: 12, right: 20, bottom: 28, left: 20 };
    return await page.screenshot({
      type: 'png',
      clip: {
        x: Math.max(0, box.x - margin.left),
        y: Math.max(0, box.y - margin.top),
        width: box.width + margin.left + margin.right,
        height: box.height + margin.top + margin.bottom,
      },
    });
  } finally {
    await browser.close();
  }
}

// ── GroupMe ───────────────────────────────────────────────────────────────────

/** Upload a PNG to GroupMe's image service; returns the attachment URL. */
async function uploadImage(token, buffer) {
  const res = await fetch(GROUPME_IMAGE_API, {
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
  return url;
}

/**
 * Create a calendar event in a topic (undocumented endpoint). GroupMe
 * auto-posts an event card message in the topic, so no separate post needed.
 * Skips creation if a live (not soft-deleted) event with the same name exists.
 */
async function createTopicEvent(token, topicId, name, cfg, startAt, endAt) {
  const listRes = await fetch(
    `https://api.groupme.com/v3/conversations/${topicId}/events/list?limit=50`,
    { headers: { 'X-Access-Token': token } },
  );
  if (listRes.ok) {
    const existing = (await listRes.json())?.response?.events ?? [];
    if (existing.some((e) => e.name === name && !e.deleted_at)) {
      return false; // already created (deletes are soft; deleted_at marks them)
    }
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

/** Post into a topic (subgroup) as the token's user: the bot API can't reach topics. */
async function postToTopic(token, topicId, text, imageUrl, sourceGuid) {
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

async function postAsBot(botId, text, imageUrl) {
  const body = { bot_id: botId, text };
  if (imageUrl) body.picture_url = imageUrl;
  const res = await fetch(GROUPME_BOT_POST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`GroupMe bot post failed: HTTP ${res.status} ${await res.text()}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const forceText = process.argv.includes('--text');
  const dateArg = process.argv.find((a) => a.startsWith('--date='))?.slice('--date='.length);

  if (dateArg && !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
    throw new Error(`Invalid --date "${dateArg}", expected YYYY-MM-DD`);
  }

  const dateKey = dateArg || etDateKey(new Date());
  const dayKey = dayKeyFor(dateKey);

  const config = await loadConfig();
  const todayDivisions = config.divisions.filter((d) => d.day === dayKey);

  if (todayDivisions.length === 0) {
    console.log(`No league night on ${dayKey} ${dateKey}: nothing to post.`);
    return;
  }

  const games = await fetchGamesToday(config, todayDivisions, dateKey);
  if (games.length === 0) {
    console.log(`No games on ${dateKey}: nothing to post.`);
    return;
  }

  // Event days (Wednesday Shuffle) get an RSVP calendar event, not an image.
  const eventCfg = EVENT_DAYS[dayKey];
  if (eventCfg) {
    const name = `${eventCfg.title} - ${shortDateLabelFor(dateKey)}`;
    const offset = etOffsetFor(dateKey);
    const startAt = `${dateKey}T${eventCfg.startTime}:00${offset}`;
    const endAt = `${dateKey}T${eventCfg.endTime}:00${offset}`;

    if (dryRun) {
      console.log(`[dry-run] Would create event "${name}" (${startAt} to ${endAt}) in the ${dayKey} topic.`);
      console.log(`[dry-run] Description: ${eventCfg.description} | Location: ${eventCfg.location.name} | Reminders: ${eventCfg.reminders.join(', ')}s before`);
      return;
    }

    const token = process.env.GROUPME_TOKEN;
    if (!token) throw new Error('Missing env var GROUPME_TOKEN');
    const topicId = CONVERSATION_IDS[dayKey];
    if (!topicId) throw new Error(`No topic mapped for ${dayKey}`);

    const created = await createTopicEvent(token, topicId, name, eventCfg, startAt, endAt);
    console.log(created
      ? `Created event "${name}" in the ${dayKey} topic.`
      : `Event "${name}" already exists in the ${dayKey} topic; skipped.`);
    return;
  }

  // No URLs in the caption: GroupMe renders a link preview next to the image
  // on some clients, which looks cluttered.
  const caption = [
    `🏐 Tonight's schedule - ${dateLabelFor(dateKey)}`,
    `🤖 Auto-posted by Matt's bot`,
  ].join('\n');

  let image = null;
  if (!forceText) {
    try {
      image = await captureScheduleImage(dateKey);
    } catch (err) {
      console.warn(`Screenshot failed (${err.message ?? err}); falling back to text format.`);
    }
  }
  const messages = image ? [caption] : buildFallbackMessages(dateKey, games);

  if (dryRun) {
    if (image) {
      const outPath = path.join(os.tmpdir(), `mv-schedule-${dateKey}.png`);
      await writeFile(outPath, image);
      console.log(`[dry-run] ${games.length} game(s) on ${dateKey}. Screenshot: ${outPath}`);
    }
    console.log(`[dry-run] Would post ${messages.length} ${image ? 'image caption' : 'text'} message(s):\n`);
    for (const message of messages) {
      console.log(`--- (${message.length} chars) ---\n${message}\n`);
    }
    return;
  }

  const token = process.env.GROUPME_TOKEN;
  if (!token) throw new Error('Missing env var GROUPME_TOKEN');

  const imageUrl = image ? await uploadImage(token, image) : null;
  const topicId = CONVERSATION_IDS[dayKey];

  if (topicId) {
    for (const [i, message] of messages.entries()) {
      await postToTopic(token, topicId, message, i === 0 ? imageUrl : null, `mv-schedule-${dateKey}-${i}`);
    }
    console.log(`Posted ${image ? 'schedule image' : `${messages.length} text message(s)`} to the ${dayKey} topic for ${dateKey} (${games.length} games).`);
  } else if (process.env.GROUPME_BOT_ID) {
    for (const [i, message] of messages.entries()) {
      await postAsBot(process.env.GROUPME_BOT_ID, message, i === 0 ? imageUrl : null);
    }
    console.log(`Posted to the main chat for ${dateKey} (${games.length} games).`);
  } else {
    throw new Error(`No topic mapped for ${dayKey} and no GROUPME_BOT_ID fallback set`);
  }
}

main().catch((err) => {
  console.error('post-daily-schedule failed:', err);
  process.exit(1);
});
