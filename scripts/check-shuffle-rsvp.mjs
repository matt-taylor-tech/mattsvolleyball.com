// Afternoon RSVP check for event days (issue #15). On shuffle Wednesdays,
// finds today's calendar event in the Wednesday group and reads its Going
// count. Below the division's minPlayers threshold it posts a "we need a few
// more" nudge; at or above, a short "we're on" confirmation.
//
// Gated the same way as event creation: no TeamLinkt game today means no
// event and no check.
//
// Env:  GROUPME_TOKEN    user access token (event list + posting)
//       GROUPME_BOT_ID   optional fallback: bot post to the group's main chat
// Args: --dry-run           print instead of posting
//       --date=YYYY-MM-DD   override "today" (ET)
//       --test              read the event from, and post to, the Bot Test Group
//       --force             skip the TeamLinkt game check (manual testing)

import {
  EVENTS_API, CONVERSATION_IDS, TEST_CONVERSATION_ID, EVENT_DAYS,
  loadConfig, etDateKey, dayKeyFor, shortDateLabelFor,
  postForm, listTopicEvents, postToTopic, postAsBot,
} from './lib/mv.mjs';

async function hasGameToday(config, dayKey, dateKey) {
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

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const testMode = process.argv.includes('--test');
  const force = process.argv.includes('--force');
  const dateArg = process.argv.find((a) => a.startsWith('--date='))?.slice('--date='.length);

  if (dateArg && !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
    throw new Error(`Invalid --date "${dateArg}", expected YYYY-MM-DD`);
  }

  const dateKey = dateArg || etDateKey(new Date());
  const dayKey = dayKeyFor(dateKey);

  const eventCfg = EVENT_DAYS[dayKey];
  if (!eventCfg) {
    console.log(`${dayKey} is not an event day: nothing to check.`);
    return;
  }

  const config = await loadConfig();
  if (config.divisions.filter((d) => d.day === dayKey).length === 0) {
    console.log(`No league night on ${dayKey} ${dateKey}: nothing to check.`);
    return;
  }
  if (!force && !(await hasGameToday(config, dayKey, dateKey))) {
    console.log(`No game on ${dateKey}: nothing to check.`);
    return;
  }

  const token = process.env.GROUPME_TOKEN;
  if (!token) throw new Error('Missing env var GROUPME_TOKEN');

  const conversationId = testMode ? TEST_CONVERSATION_ID : CONVERSATION_IDS[dayKey];
  const target = testMode ? 'TEST group' : `${dayKey} group`;
  const eventName = `${eventCfg.title} - ${shortDateLabelFor(dateKey)}`;

  const events = await listTopicEvents(token, conversationId);
  const event = events.find((e) => e.name === eventName);
  if (!event) {
    // The 10 AM run should have created it; a red run flags the anomaly.
    throw new Error(`Event "${eventName}" not found in the ${target}`);
  }

  // RSVPs are optional (players can just show up), so this is a headcount
  // forecast ping rather than a "can we play" threshold.
  const going = event.going_count ?? (event.going || []).length;
  const text = `🏐 Shuffle tonight! ${going} RSVP'd so far. Tap Going on the event so we know how many to expect, or just show up by 6:30.`;
  const message = `${text}\n🤖 Auto-posted by Matt's bot`;

  if (dryRun) {
    console.log(`[dry-run] "${eventName}" going_count=${going}. Would post to the ${target}:\n\n${message}`);
    return;
  }

  const guid = testMode ? `mv-rsvp-test-${dateKey}-${Date.now()}` : `mv-rsvp-${dateKey}`;
  const fallbackBotId = testMode ? process.env.GROUPME_BOT_ID_TEST : process.env.GROUPME_BOT_ID;

  if (conversationId) {
    await postToTopic(token, conversationId, message, null, guid);
    console.log(`Posted RSVP check (${going} going) to the ${target}.`);
  } else if (fallbackBotId) {
    await postAsBot(fallbackBotId, message, null);
    console.log(`Posted RSVP check (${going} going) to the main chat.`);
  } else {
    throw new Error(`No conversation mapped for ${dayKey} and no bot fallback set`);
  }
}

main().catch((err) => {
  console.error('check-shuffle-rsvp failed:', err);
  process.exit(1);
});
