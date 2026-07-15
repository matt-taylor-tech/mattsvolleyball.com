// Posts today's schedule to the matching night's GroupMe topic.
//
// Primary: screenshots today's section of the live schedule page with
// Playwright, uploads it to GroupMe's image service, and posts it with a
// short caption (date + bot notice; deliberately no URLs, since GroupMe
// link previews clutter image posts).
// Fallback: if the screenshot fails, posts a text version instead: games
// grouped by time, fake-bold (Unicode sans-bold) times and team names.
// Event days (Wednesday Shuffle) get an RSVP calendar event, not an image.
//
// Shared config parsing, date helpers, and GroupMe plumbing live in
// scripts/lib/mv.mjs.
//
// Env:  GROUPME_TOKEN    user access token: required (image upload + posting
//                        into topics; bots get 401 on topic IDs)
//       GROUPME_BOT_ID   optional fallback: bot post to the group's main chat
//                        (used only if the day has no conversation mapped)
// Args: --dry-run           save the screenshot locally and print the caption
//       --date=YYYY-MM-DD   override "today" (interpreted as an ET calendar date)
//       --text              skip the screenshot and use the text format (for testing)
//       --test              route all posts/events to the Bot Test Group
//                           (bot fallback uses GROUPME_BOT_ID_TEST)
//
// Exits 0 (silently, no post) on non-league days and days with no games.
// Exits 1 on config, fetch, capture, or GroupMe errors so the Actions run shows red.

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  EVENTS_API, TIME_ZONE, CONVERSATION_IDS, TEST_CONVERSATION_ID, EVENT_DAYS,
  loadConfig, etDateKey, dayKeyFor, dateLabelFor, shortDateLabelFor,
  etOffsetFor, utcNoonFor, postForm, cellText, boldSans, PLACEHOLDER_TEAMS,
  packMessages, uploadImage, postToTopic, postAsBot, createTopicEvent,
} from './lib/mv.mjs';

const SCHEDULE_URL = 'https://mattsvolleyball.com/leagues/schedule';

// ── TeamLinkt fetching ────────────────────────────────────────────────────────

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

// ── Screenshot ────────────────────────────────────────────────────────────────

/** "Tue Jul 14, 2026": matches the date headings TeamLinkt data renders on the schedule page. */
function pageDateHeadingFor(dateKey) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  }).formatToParts(utcNoonFor(dateKey));
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('weekday')} ${get('month')} ${get('day')}, ${get('year')}`;
}

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

// ── Text fallback formatting ──────────────────────────────────────────────────

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

  return packMessages(header, sections, footer);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const forceText = process.argv.includes('--text');
  const testMode = process.argv.includes('--test');
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

  const conversationId = testMode ? TEST_CONVERSATION_ID : CONVERSATION_IDS[dayKey];
  const target = testMode ? 'TEST group' : `${dayKey} topic`;
  // Unique guids in test mode so rapid repeat runs don't hit the 1-minute dedup.
  const guidBase = testMode ? `mv-test-${dateKey}-${Date.now()}` : `mv-schedule-${dateKey}`;

  // Event days (Wednesday Shuffle) get an RSVP calendar event, not an image.
  const eventCfg = EVENT_DAYS[dayKey];
  if (eventCfg) {
    const name = `${eventCfg.title} - ${shortDateLabelFor(dateKey)}`;
    const offset = etOffsetFor(dateKey);
    const startAt = `${dateKey}T${eventCfg.startTime}:00${offset}`;
    const endAt = `${dateKey}T${eventCfg.endTime}:00${offset}`;

    if (dryRun) {
      console.log(`[dry-run] Would create event "${name}" (${startAt} to ${endAt}) in the ${target}.`);
      console.log(`[dry-run] Description: ${eventCfg.description} | Location: ${eventCfg.location.name} | Reminders: ${eventCfg.reminders.join(', ')}s before`);
      return;
    }

    const token = process.env.GROUPME_TOKEN;
    if (!token) throw new Error('Missing env var GROUPME_TOKEN');
    if (!conversationId) throw new Error(`No conversation mapped for ${dayKey}`);

    const created = await createTopicEvent(token, conversationId, name, eventCfg, startAt, endAt);
    console.log(created
      ? `Created event "${name}" in the ${target}.`
      : `Event "${name}" already exists in the ${target}; skipped.`);
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
  const fallbackBotId = testMode ? process.env.GROUPME_BOT_ID_TEST : process.env.GROUPME_BOT_ID;

  if (conversationId) {
    for (const [i, message] of messages.entries()) {
      await postToTopic(token, conversationId, message, i === 0 ? imageUrl : null, `${guidBase}-${i}`);
    }
    console.log(`Posted ${image ? 'schedule image' : `${messages.length} text message(s)`} to the ${target} for ${dateKey} (${games.length} games).`);
  } else if (fallbackBotId) {
    for (const [i, message] of messages.entries()) {
      await postAsBot(fallbackBotId, message, i === 0 ? imageUrl : null);
    }
    console.log(`Posted to the main chat for ${dateKey} (${games.length} games).`);
  } else {
    throw new Error(`No conversation mapped for ${dayKey} and no bot fallback set`);
  }
}

main().catch((err) => {
  console.error('post-daily-schedule failed:', err);
  process.exit(1);
});
