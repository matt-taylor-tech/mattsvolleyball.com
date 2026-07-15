// Daily missing-scores nudge (issue #10, team-level): the morning after a
// game night, if any of last night's games have no submitted score, post one
// nudge to that night's topic listing the matchups. Anyone on either team
// can submit, so no captain tagging. Completely silent when everything is
// scored (the weekly recap handles celebrating results).
//
// Env:  GROUPME_TOKEN    user access token (posting into topics)
//       GROUPME_BOT_ID   optional fallback: bot post to the group's main chat
// Args: --dry-run           print the message instead of posting
//       --date=YYYY-MM-DD   the GAME night to check (default: yesterday, ET)
//       --test              route posts to the Bot Test Group

import {
  CONVERSATION_IDS, TEST_CONVERSATION_ID,
  loadConfig, etDateKey, dayKeyFor, dateLabelFor, previousDateKey,
  fetchResults, boldSans, packMessages, postToTopic, postAsBot,
} from './lib/mv.mjs';

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
    console.log(`No league night on ${dayKey} ${dateKey}: nothing to check.`);
    return;
  }

  const sections = [];
  for (const division of nightDivisions) {
    const games = await fetchResults(division.id, dateKey);
    const missing = games.filter((g) => g.homeWins === null || g.awayWins === null);
    if (missing.length === 0) continue;
    const lines = missing.map((g) => `${g.home} vs ${g.away}`);
    sections.push(`${boldSans(division.name)}\n━━━━━━━━━━━━━\n${lines.join('\n')}`);
  }

  if (sections.length === 0) {
    console.log(`All scores in for ${dateKey}: nothing to post.`);
    return;
  }

  const header = `⚠️ Missing scores from ${dateLabelFor(dateKey)}`;
  const footer = 'Anyone on either team can submit scores in the TeamLinkt app.\n🤖 Auto-posted by Matt\'s bot';
  const messages = packMessages(header, sections, footer);

  if (dryRun) {
    console.log(`[dry-run] Would post ${messages.length} nudge message(s) for ${dayKey} ${dateKey}:\n`);
    for (const message of messages) {
      console.log(`--- (${message.length} chars) ---\n${message}\n`);
    }
    return;
  }

  const token = process.env.GROUPME_TOKEN;
  if (!token) throw new Error('Missing env var GROUPME_TOKEN');

  const conversationId = testMode ? TEST_CONVERSATION_ID : CONVERSATION_IDS[dayKey];
  const target = testMode ? 'TEST group' : `${dayKey} topic`;
  const guidBase = testMode ? `mv-missing-test-${dateKey}-${Date.now()}` : `mv-missing-${dateKey}`;
  const fallbackBotId = testMode ? process.env.GROUPME_BOT_ID_TEST : process.env.GROUPME_BOT_ID;

  if (conversationId) {
    for (const [i, message] of messages.entries()) {
      await postToTopic(token, conversationId, message, null, `${guidBase}-${i}`);
    }
    console.log(`Posted missing-scores nudge to the ${target} for ${dateKey}.`);
  } else if (fallbackBotId) {
    for (const message of messages) {
      await postAsBot(fallbackBotId, message, null);
    }
    console.log(`Posted missing-scores nudge to the main chat for ${dateKey}.`);
  } else {
    throw new Error(`No conversation mapped for ${dayKey} and no bot fallback set`);
  }
}

main().catch((err) => {
  console.error('post-missing-scores failed:', err);
  process.exit(1);
});
