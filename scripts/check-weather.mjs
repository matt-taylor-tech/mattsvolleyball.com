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
const DEFAULT_POP_THRESHOLD = 50; // percent chance of precipitation (rain tier)
// Storm keywords trump the rain threshold, but a NC summer "slight chance of
// thunderstorms" (~15-20%) is background noise; require this much probability
// before a storm watch posts, so the warnings stay meaningful.
const STORM_POP_FLOOR = 30;

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

  // Tiering mirrors the rainout policy (src/pages/rainout-info.astro):
  // lightning and heavy rain are no-play conditions, so storm-tier forecasts
  // warn of a possible cancellation; drizzle/moderate rain are play-through,
  // so rain-tier posts are reassurance, not warnings. The call itself is
  // made by Matt and posted in the chat by 5 PM.
  const wettest = window.reduce((a, b) =>
    ((a.probabilityOfPrecipitation?.value ?? 0) >= (b.probabilityOfPrecipitation?.value ?? 0) ? a : b));
  const maxPop = wettest.probabilityOfPrecipitation?.value ?? 0;
  const stormPeriod = window.find((p) =>
    /thunder|lightning|heavy/i.test(p.shortForecast)
    && (p.probabilityOfPrecipitation?.value ?? 0) >= STORM_POP_FLOOR);

  console.log(window.map((p) =>
    `${p.startTime.slice(11, 16)} ET: ${p.probabilityOfPrecipitation?.value ?? 0}% precip, ${p.temperature}${p.temperatureUnit}, ${p.shortForecast}`,
  ).join('\n'));

  let text;
  if (stormPeriod) {
    // Storms matter at any probability; quote the storm period's forecast.
    const stormPop = Math.max(maxPop, stormPeriod.probabilityOfPrecipitation?.value ?? 0);
    text = `⛈️ Storm watch for tonight (${dateLabelFor(dateKey)}): up to ${stormPop}% chance, forecast says "${stormPeriod.shortForecast}". Lightning means we don't play, so a cancellation is possible. The call gets posted right here by 5 PM; captains, make sure your team sees it. Called games move to the end of the season schedule.`;
  } else if (maxPop >= popThreshold) {
    text = `🌧️ Rain in tonight's forecast (${dateLabelFor(dateKey)}): up to ${maxPop}%, "${wettest.shortForecast}". Heads up: we play through drizzle and moderate rain, so plan on games as usual unless you hear otherwise here by 5 PM.`;
  } else {
    console.log(`Forecast is fine (max ${maxPop}% precip, no storms): nothing to post.`);
    return;
  }

  const message = `${text}\n🤖 Auto-posted by Matt's bot`;

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
