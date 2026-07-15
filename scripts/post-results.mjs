// Weekly "what happened last week" recap, posted to each night's GroupMe
// topic (issues #9 and #11): one message per division with last week's
// set-by-set results (winner fake-bolded, sets-won match score) followed by
// current standings. Runs Monday midday; missing scores get their own daily
// nudge via post-missing-scores.mjs.
//
// For each league night it reports that night's most recent occurrence in
// the past 7 days (on a Monday run: last Mon/Tue/Wed/Thu).
//
// Env:  GROUPME_TOKEN    user access token (posting into topics)
//       GROUPME_BOT_ID   optional fallback: bot post to the group's main chat
// Args: --dry-run     print the messages instead of posting
//       --day=Tue     recap a single night only (default: all nights)
//       --date=YYYY-MM-DD  game night override (single night implied by its weekday)
//       --test        route posts to the Bot Test Group

import {
  CONVERSATION_IDS, TEST_CONVERSATION_ID,
  loadConfig, etDateKey, dayKeyFor, dateLabelFor, utcNoonFor,
  fetchResults, fetchStandings, boldSans, packMessages, postToTopic, postAsBot,
} from './lib/mv.mjs';

/** Most recent date strictly before today whose weekday is dayKey (1-7 days back). */
function lastOccurrenceOf(dayKey, todayKey) {
  for (let back = 1; back <= 7; back++) {
    const d = utcNoonFor(todayKey);
    d.setUTCDate(d.getUTCDate() - back);
    const key = d.toISOString().slice(0, 10);
    if (dayKeyFor(key) === dayKey) return key;
  }
  throw new Error(`No ${dayKey} in the past week of ${todayKey}`);
}

// ── Formatting ────────────────────────────────────────────────────────────────

function resultLine(game) {
  const scored = game.homeWins !== null && game.awayWins !== null;
  if (!scored) return `⚠️ ${game.home} vs ${game.away} · score never submitted`;

  const homeWon = game.homeWins > game.awayWins;
  const [winner, loser] = homeWon ? [game.home, game.away] : [game.away, game.home];
  const setsWon = homeWon ? `${game.homeWins}-${game.awayWins}` : `${game.awayWins}-${game.homeWins}`;
  const setScores = (game.sets || [])
    .map((s) => (homeWon ? `${s.home}-${s.away}` : `${s.away}-${s.home}`))
    .join(', ');

  if (game.homeWins === game.awayWins) {
    return `${game.home} ${game.homeWins}-${game.awayWins} ${game.away}${setScores ? ` (${setScores})` : ''}`;
  }
  return `${boldSans(winner)} d. ${loser} ${setsWon}${setScores ? ` (${setScores})` : ''}`;
}

function resultsSection(games) {
  return `🏆 Results\n━━━━━━━━━━━━━\n${games.map(resultLine).join('\n')}`;
}

function standingsSection(standings) {
  const lines = standings.map((s) => `${s.rank}. ${s.name} ${s.wins}-${s.losses} · ${s.points} pts`);
  return `📊 Standings\n━━━━━━━━━━━━━\n${lines.join('\n')}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const testMode = process.argv.includes('--test');
  const dayArg = process.argv.find((a) => a.startsWith('--day='))?.slice('--day='.length);
  const dateArg = process.argv.find((a) => a.startsWith('--date='))?.slice('--date='.length);

  if (dateArg && !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
    throw new Error(`Invalid --date "${dateArg}", expected YYYY-MM-DD`);
  }

  const todayKey = etDateKey(new Date());
  const config = await loadConfig();

  const nights = [...new Set(config.divisions.map((d) => d.day))]
    .filter((day) => (dateArg ? day === dayKeyFor(dateArg) : !dayArg || day === dayArg))
    .map((day) => ({ day, dateKey: dateArg ?? lastOccurrenceOf(day, todayKey) }));
  if (nights.length === 0) throw new Error('No league night matches the given --day/--date');

  const token = process.env.GROUPME_TOKEN;
  if (!dryRun && !token) throw new Error('Missing env var GROUPME_TOKEN');
  const fallbackBotId = testMode ? process.env.GROUPME_BOT_ID_TEST : process.env.GROUPME_BOT_ID;

  const footer = `🤖 Auto-posted by Matt's bot`;

  for (const { day, dateKey } of nights) {
    // One self-contained message per division: last week's results + standings.
    const messages = [];
    for (const division of config.divisions.filter((d) => d.day === day)) {
      const games = await fetchResults(division.id, dateKey);
      const standings = await fetchStandings(division.id, config.seasonId);

      const sections = [];
      if (games.length > 0) sections.push(resultsSection(games));
      if (standings.length >= 2) sections.push(standingsSection(standings));
      if (sections.length === 0) continue;

      const header = `🏐 ${boldSans(division.name)} - last week (${dateLabelFor(dateKey)})`;
      messages.push(...packMessages(header, sections, footer));
    }

    if (messages.length === 0) {
      console.log(`${day} (${dateKey}): nothing to recap; skipped.`);
      continue;
    }

    if (dryRun) {
      console.log(`[dry-run] ${day} (${dateKey}): would post ${messages.length} message(s):\n`);
      for (const message of messages) {
        console.log(`--- (${message.length} chars) ---\n${message}\n`);
      }
      continue;
    }

    const conversationId = testMode ? TEST_CONVERSATION_ID : CONVERSATION_IDS[day];
    const target = testMode ? `TEST group (${day})` : `${day} topic`;
    const guidBase = testMode
      ? `mv-recap-test-${dateKey}-${Date.now()}`
      : `mv-recap-${dateKey}`;

    if (conversationId) {
      for (const [i, message] of messages.entries()) {
        await postToTopic(token, conversationId, message, null, `${guidBase}-${i}`);
      }
      console.log(`Posted ${messages.length} recap message(s) to the ${target} for ${dateKey}.`);
    } else if (fallbackBotId) {
      for (const message of messages) {
        await postAsBot(fallbackBotId, message, null);
      }
      console.log(`Posted ${day} recap to the main chat for ${dateKey}.`);
    } else {
      throw new Error(`No conversation mapped for ${day} and no bot fallback set`);
    }
  }
}

main().catch((err) => {
  console.error('post-results failed:', err);
  process.exit(1);
});
