// Daily missing-scores nudge (issue #10, captains edition): the morning
// after a game night, each division with unsubmitted scores gets one nudge
// posted to that division's topic in the CAPTAINS group. Team-level only
// (anyone on either team can submit). Completely silent when everything is
// scored; divisions without a mapped captains topic are skipped with a
// warning so a config gap can't misroute a post.
//
// Env:  GROUPME_TOKEN    user access token (posting into topics)
// Args: --dry-run           print the messages instead of posting
//       --date=YYYY-MM-DD   the GAME night to check (default: yesterday, ET)
//       --test              route to the Bot Test Group's mirror topics
//       --simulate          fabricate one missing game per division (routing
//                           rehearsal; message is clearly labeled as a test)

import {
  loadConfig, etDateKey, dayKeyFor, dateLabelFor, previousDateKey,
  fetchResults, postToTopic,
} from './lib/mv.mjs';

// Captains-group topic per division. `live` values get filled in once the
// real captains group is wired up; `test` values are the Bot Test Group's
// mirror topics. Keyed by UPCOMING (Summer Redux) division ids.
// Live topics are in "Matt's Volleyball Captains Chats" (group 116067407);
// test topics are the Bot Test Group's mirrors.
const CAPTAINS_TOPICS = {
  '305891': { label: 'Tue Competitive', live: '116067429', test: '116089944' }, // Tuesday Comp Captains
  '305890': { label: 'Tue Recreational', live: '116067421', test: '116089938' }, // Tuesday Rec Captains
  '305892': { label: 'Thu Competitive', live: '116067453', test: '116089929' }, // Thursday Comp Captains
  '305893': { label: 'Thu Recreational', live: '116067447', test: '116089959' }, // Thursday Rec Captains
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const testMode = process.argv.includes('--test');
  const simulate = process.argv.includes('--simulate');
  const dateArg = process.argv.find((a) => a.startsWith('--date='))?.slice('--date='.length);

  if (dateArg && !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
    throw new Error(`Invalid --date "${dateArg}", expected YYYY-MM-DD`);
  }
  if (simulate && !dryRun && !testMode) {
    throw new Error('--simulate posts fake games; it requires --dry-run or --test');
  }

  const dateKey = dateArg || previousDateKey(etDateKey(new Date()));
  const dayKey = dayKeyFor(dateKey);

  const config = await loadConfig();
  // Untracked divisions (shuffle) never submit scores; don't nag about them.
  const nightDivisions = config.divisions.filter((d) => d.day === dayKey && d.tracked);

  if (nightDivisions.length === 0) {
    console.log(`No score-tracked league night on ${dayKey} ${dateKey}: nothing to check.`);
    return;
  }

  const token = process.env.GROUPME_TOKEN;
  if (!dryRun && !token) throw new Error('Missing env var GROUPME_TOKEN');

  let posted = 0;
  for (const division of nightDivisions) {
    let missing;
    if (simulate) {
      missing = [{ home: `Fake Team A (${division.name})`, away: 'Fake Team B' }];
    } else {
      const games = await fetchResults(division.id, dateKey);
      missing = games.filter((g) => g.homeWins === null || g.awayWins === null);
    }
    if (missing.length === 0) continue;

    const topic = CAPTAINS_TOPICS[division.id];
    const conversationId = testMode ? topic?.test : topic?.live;
    if (!conversationId) {
      console.warn(`No ${testMode ? 'test' : 'live'} captains topic mapped for ${division.day} ${division.name}; skipping its nudge.`);
      continue;
    }

    const lines = missing.map((g) => `${g.home} vs ${g.away}`);
    const message = [
      `${simulate ? '🧪 ROUTING TEST (ignore): ' : ''}⚠️ Missing scores from ${dateLabelFor(dateKey)}`,
      '━━━━━━━━━━━━━',
      lines.join('\n'),
      '',
      'Anyone on either team can submit scores in the TeamLinkt app.',
      `🤖 Auto-posted by Matt's bot`,
    ].join('\n');

    const guid = testMode
      ? `mv-missing-test-${division.id}-${dateKey}-${Date.now()}`
      : `mv-missing-${division.id}-${dateKey}`;

    if (dryRun) {
      console.log(`[dry-run] Would post to "${topic.label}" topic (${conversationId}):\n\n${message}\n`);
    } else {
      await postToTopic(token, conversationId, message, null, guid);
      console.log(`Posted missing-scores nudge for ${topic.label} to topic ${conversationId}.`);
    }
    posted++;
  }

  if (posted === 0) {
    console.log(`All scores in for ${dateKey}: nothing to post.`);
  }
}

main().catch((err) => {
  console.error('post-missing-scores failed:', err);
  process.exit(1);
});
