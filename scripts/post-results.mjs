// Posts last night's scores and current standings to that night's GroupMe
// topic (issues #9 and #11). Text format: set-by-set results with the winner
// fake-bolded, then a standings list per division.
//
// Shared config parsing, date helpers, and GroupMe plumbing live in
// scripts/lib/mv.mjs.
//
// Env:  GROUPME_TOKEN    user access token (posting into topics)
//       GROUPME_BOT_ID   optional fallback: bot post to the group's main chat
// Args: --dry-run           print the message instead of posting
//       --date=YYYY-MM-DD   the GAME night to report (default: yesterday, ET)
//       --test              route posts to the Bot Test Group
//
// Exits 0 (silently, no post) when the night had no league games or no
// submitted scores yet. Exits 1 on config, fetch, or GroupMe errors.

import {
  API_BASE, ORG_ID, EVENTS_API, CONVERSATION_IDS, TEST_CONVERSATION_ID,
  loadConfig, etDateKey, dayKeyFor, dateLabelFor, previousDateKey,
  postForm, cellText, boldSans, packMessages, postToTopic, postAsBot,
} from './lib/mv.mjs';

// ── TeamLinkt fetching ────────────────────────────────────────────────────────

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

async function fetchResults(divisionId, dateKey) {
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

async function fetchStandings(divisionId, seasonId) {
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

// ── Formatting ────────────────────────────────────────────────────────────────

function resultLine(game) {
  const scored = game.homeWins !== null && game.awayWins !== null;
  if (!scored) return `${game.home} vs ${game.away} · no score submitted`;

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

function standingsSection(standings) {
  const lines = standings.map((s) => `${s.rank}. ${s.name} ${s.wins}-${s.losses} · ${s.points} pts`);
  return `📊 Standings\n━━━━━━━━━━━━━\n${lines.join('\n')}`;
}

function resultsSection(games) {
  return `🏆 Results\n━━━━━━━━━━━━━\n${games.map(resultLine).join('\n')}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const testMode = process.argv.includes('--test');
  const dateArg = process.argv.find((a) => a.startsWith('--date='))?.slice('--date='.length);

  if (dateArg && !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
    throw new Error(`Invalid --date "${dateArg}", expected YYYY-MM-DD`);
  }

  const dateKey = dateArg || previousDateKey(etDateKey(new Date()));
  const dayKey = dayKeyFor(dateKey);

  const config = await loadConfig();
  const nightDivisions = config.divisions.filter((d) => d.day === dayKey);

  if (nightDivisions.length === 0) {
    console.log(`No league night on ${dayKey} ${dateKey}: nothing to post.`);
    return;
  }

  // One self-contained message per division: its results, then its standings.
  const footer = `🤖 Auto-posted by Matt's bot`;
  const messages = [];
  let gameCount = 0;
  let scoredCount = 0;
  for (const division of nightDivisions) {
    const games = await fetchResults(division.id, dateKey);
    if (games.length === 0) continue;
    gameCount += games.length;
    scoredCount += games.filter((g) => g.homeWins !== null).length;

    const sections = [resultsSection(games)];
    const standings = await fetchStandings(division.id, config.seasonId);
    if (standings.length > 0) sections.push(standingsSection(standings));

    const header = `🏐 ${boldSans(division.name)} - ${dateLabelFor(dateKey)}`;
    messages.push(...packMessages(header, sections, footer));
  }

  if (gameCount === 0) {
    console.log(`No games on ${dateKey}: nothing to post.`);
    return;
  }
  if (scoredCount === 0) {
    console.log(`Games on ${dateKey} have no submitted scores yet: nothing to post.`);
    return;
  }

  if (dryRun) {
    console.log(`[dry-run] Would post ${messages.length} message(s) for ${dayKey} ${dateKey}:\n`);
    for (const message of messages) {
      console.log(`--- (${message.length} chars) ---\n${message}\n`);
    }
    return;
  }

  const token = process.env.GROUPME_TOKEN;
  if (!token) throw new Error('Missing env var GROUPME_TOKEN');

  const conversationId = testMode ? TEST_CONVERSATION_ID : CONVERSATION_IDS[dayKey];
  const target = testMode ? 'TEST group' : `${dayKey} topic`;
  const guidBase = testMode ? `mv-results-test-${dateKey}-${Date.now()}` : `mv-results-${dateKey}`;
  const fallbackBotId = testMode ? process.env.GROUPME_BOT_ID_TEST : process.env.GROUPME_BOT_ID;

  if (conversationId) {
    for (const [i, message] of messages.entries()) {
      await postToTopic(token, conversationId, message, null, `${guidBase}-${i}`);
    }
    console.log(`Posted ${messages.length} results message(s) to the ${target} for ${dateKey}.`);
  } else if (fallbackBotId) {
    for (const message of messages) {
      await postAsBot(fallbackBotId, message, null);
    }
    console.log(`Posted results to the main chat for ${dateKey}.`);
  } else {
    throw new Error(`No conversation mapped for ${dayKey} and no bot fallback set`);
  }
}

main().catch((err) => {
  console.error('post-results failed:', err);
  process.exit(1);
});
