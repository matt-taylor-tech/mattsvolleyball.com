// Game-day weather heads-up (issue #16). On league nights, checks the NWS
// hourly forecast at the courts for the game window and posts a warning to
// the night's conversation when rain or storms look likely. The actual
// rainout CALL stays human; this only sets expectations.
//
// Silent when the forecast is fine, when there's no league night, or when
// TeamLinkt has no games that day.
//
// Env:  GROUPME_TOKEN    user access token
//       GROUPME_BOT_ID   optional fallback: bot post to the group's main chat
// Args: --dry-run             print instead of posting
//       --date=YYYY-MM-DD     override "today" (ET)
//       --test                route posts to the Bot Test Group
//       --force               skip the TeamLinkt game check (testing)
//       --pop-threshold=N     override the rain-probability trigger (testing)

import {
  CONVERSATION_IDS, TEST_CONVERSATION_ID,
  loadConfig, etDateKey, dayKeyFor, dateLabelFor,
  hasGamesOn, postToTopic, postAsBot,
} from './lib/mv.mjs';

// Courts at Saeed's Bar & Grill.
const LAT = 35.4837;
const LON = -80.8683;
const NWS_UA = 'mattsvolleyball.com weather bot (matt@mattsvolleyball.com)';

// Game window, ET wall-clock hours (first serves 6:30, last games end ~9:30).
const WINDOW_HOURS = [18, 19, 20, 21];
const DEFAULT_POP_THRESHOLD = 50; // percent chance of precipitation

async function nws(url) {
  const res = await fetch(url, { headers: { 'User-Agent': NWS_UA } });
  if (!res.ok) throw new Error(`NWS fetch failed: HTTP ${res.status} for ${url}`);
  return res.json();
}

/** Hourly forecast periods covering the game window on the given ET date. */
async function gameWindowForecast(dateKey) {
  const points = await nws(`https://api.weather.gov/points/${LAT},${LON}`);
  const hourly = await nws(points.properties.forecastHourly);
  return (hourly.properties.periods || []).filter((p) => {
    if (!p.startTime.startsWith(dateKey)) return false;
    const hour = Number(p.startTime.slice(11, 13));
    return WINDOW_HOURS.includes(hour);
  });
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const testMode = process.argv.includes('--test');
  const force = process.argv.includes('--force');
  const dateArg = process.argv.find((a) => a.startsWith('--date='))?.slice('--date='.length);
  const popArg = process.argv.find((a) => a.startsWith('--pop-threshold='))?.slice('--pop-threshold='.length);
  const popThreshold = popArg !== undefined ? Number(popArg) : DEFAULT_POP_THRESHOLD;

  if (dateArg && !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
    throw new Error(`Invalid --date "${dateArg}", expected YYYY-MM-DD`);
  }

  const dateKey = dateArg || etDateKey(new Date());
  const dayKey = dayKeyFor(dateKey);

  const config = await loadConfig();
  if (config.divisions.filter((d) => d.day === dayKey).length === 0) {
    console.log(`No league night on ${dayKey} ${dateKey}: nothing to check.`);
    return;
  }
  if (!force && !(await hasGamesOn(config, dayKey, dateKey))) {
    console.log(`No games on ${dateKey}: nothing to check.`);
    return;
  }

  const window = await gameWindowForecast(dateKey);
  if (window.length === 0) {
    console.log(`No forecast periods for the ${dateKey} game window (too far out?).`);
    return;
  }

  const worst = window.reduce((a, b) =>
    ((a.probabilityOfPrecipitation?.value ?? 0) >= (b.probabilityOfPrecipitation?.value ?? 0) ? a : b));
  const maxPop = worst.probabilityOfPrecipitation?.value ?? 0;
  const stormy = window.some((p) => /thunder|storm/i.test(p.shortForecast));

  console.log(window.map((p) =>
    `${p.startTime.slice(11, 16)} ET: ${p.probabilityOfPrecipitation?.value ?? 0}% precip, ${p.temperature}${p.temperatureUnit}, ${p.shortForecast}`,
  ).join('\n'));

  if (maxPop < popThreshold && !stormy) {
    console.log(`Forecast is fine (max ${maxPop}% precip, no storms): nothing to post.`);
    return;
  }

  const emoji = stormy ? '⛈️' : '🌧️';
  const message = [
    `${emoji} Weather heads-up for tonight (${dateLabelFor(dateKey)}): up to ${maxPop}% chance of rain around game time, forecast says "${worst.shortForecast}".`,
    `Games are ON unless you hear otherwise here. Rainout policy details are on the site.`,
    `🤖 Auto-posted by Matt's bot`,
  ].join('\n');

  if (dryRun) {
    console.log(`\n[dry-run] Would post:\n${message}`);
    return;
  }

  const token = process.env.GROUPME_TOKEN;
  if (!token) throw new Error('Missing env var GROUPME_TOKEN');

  const conversationId = testMode ? TEST_CONVERSATION_ID : CONVERSATION_IDS[dayKey];
  const target = testMode ? 'TEST group' : `${dayKey} conversation`;
  const guid = testMode ? `mv-weather-test-${dateKey}-${Date.now()}` : `mv-weather-${dateKey}`;
  const fallbackBotId = testMode ? process.env.GROUPME_BOT_ID_TEST : process.env.GROUPME_BOT_ID;

  if (conversationId) {
    await postToTopic(token, conversationId, message, null, guid);
    console.log(`Posted weather heads-up (${maxPop}%) to the ${target}.`);
  } else if (fallbackBotId) {
    await postAsBot(fallbackBotId, message, null);
    console.log(`Posted weather heads-up (${maxPop}%) to the main chat.`);
  } else {
    throw new Error(`No conversation mapped for ${dayKey} and no bot fallback set`);
  }
}

main().catch((err) => {
  console.error('check-weather failed:', err);
  process.exit(1);
});
