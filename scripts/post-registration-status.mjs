// Registration status post (issue #13). While a registration window is open
// (live from the TeamLinkt register page), posts a per-division spots
// summary with the signup link to the main league group, but only when the
// counts have changed since the last post.
//
// Stateless dedupe: the message's source_guid encodes the counts snapshot,
// and recent group messages are scanned for it before posting. Counts only
// grow, so an unchanged snapshot means nothing new to say.
//
// Quiet rule: once the team nights are full and the digest saying so has
// posted, the main group hears nothing more for the rest of the season except
// a spot-opened alert when a TEAM drops. Player-cap nights (Wed Shuffle) keep
// being counted and shown in the digest, but their counts never trigger a post
// to the main group -- a shuffle roster ticks up one player at a time, and
// redigesting the same two FULL lines on each tick is pestering, not news.
//
// --shuffle mode is the other half of that trade: the shuffle count still gets
// an audience, just in the night's own group and on a fixed twice-a-week
// cadence instead of daily in front of everyone.
//
// Env:  GROUPME_TOKEN    user access token
// Args: --dry-run     print instead of posting
//       --force       skip the registration-window gate (testing)
//       --test        route posts to the Bot Test Group
//       --shuffle     post spots-left to each player-cap night's own group
//                     instead of the status digest to the main group

import {
  API_BASE, ORG_ID, MAIN_GROUP_ID, TEST_CONVERSATION_ID, TIME_ZONE,
  CONVERSATION_IDS, etDateKey, loadUpcomingConfig, postForm, postToTopic,
} from './lib/mv.mjs';

// The general registration page we tell people to visit. No `cid`, so it does
// not preselect a night. Matches REGISTRATION_PAGE_URL in
// src/lib/seasonConfig.ts, and never changes between seasons.
const REGISTER_PAGE = 'https://app.teamlinkt.com/register/find/mattsvolleyball';

// The page we read the registration window from. This one needs a `cid`:
// TeamLinkt's bare find page lists nothing until registration opens, while a
// cid page lists the whole season. The id changes every season, so keep it in
// step with UPCOMING_REG_CONTAINER_IDS in src/lib/seasonConfig.ts.
const REGISTER_SCRAPE_PAGE = `${REGISTER_PAGE}?cid=77315`;

// ── Registration window (live TeamLinkt scrape) ───────────────────────────────

/** 'YYYY-MM-DD HH:MM:SS' of the current moment in ET, for lexical comparison. */
function etNowString() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

/** True while any registration window on the TeamLinkt register page is open. */
async function registrationIsOpen() {
  const res = await fetch(REGISTER_SCRAPE_PAGE, { headers: { 'User-Agent': 'MattsVolleyball/1.0' } });
  if (!res.ok) throw new Error(`Register page fetch failed: HTTP ${res.status}`);
  const html = await res.text();
  const match = html.match(/season_registration_grouped\s*=\s*(\{[\s\S]*?\});\s*\n/);
  if (!match) return false;

  const windows = [];
  (function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      const reg = node.AssociationRegistration;
      if (reg?.open_datetime && reg?.close_datetime) {
        windows.push([reg.open_datetime, reg.close_datetime]);
      }
      Object.values(node).forEach(walk);
    }
  })(JSON.parse(match[1]));

  const now = etNowString();
  return windows.some(([open, close]) => open <= now && now <= close);
}

// ── Counts ────────────────────────────────────────────────────────────────────

async function fetchTeams(seasonId, divisionId) {
  const teams = await postForm(`${API_BASE}/getTeams/${ORG_ID}/${seasonId}`, {
    'group_ids[division]': divisionId,
    season_id: seasonId,
  });
  return Array.isArray(teams) ? teams : [];
}

/** Sum of roster sizes across a division's teams (shuffle player count). */
async function fetchPlayerCount(seasonId, divisionId) {
  const teams = await fetchTeams(seasonId, divisionId);
  let total = 0;
  for (const team of teams) {
    const res = await fetch(`${API_BASE}/getTeam/${ORG_ID}/${team.id}`);
    if (!res.ok) continue;
    const data = await res.json();
    total += data?.payload?.Team?.team_member_count ?? 0;
  }
  return total;
}

/**
 * source_guids of recent messages, newest first.
 *
 * Pages backwards until `stopAt` matches a guid or `maxPages` requests have
 * gone out. One page is NOT enough for the snapshot baseline: 100 messages is
 * about three weeks in the main group, and the quiet rule can leave the bot
 * silent for a whole season, so the last digest we need to compare against
 * would scroll out of reach and the bot would start over from scratch.
 */
async function recentGuids(token, conversationId, { stopAt, maxPages = 6 } = {}) {
  const out = [];
  let beforeId = null;
  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(`https://api.groupme.com/v3/groups/${conversationId}/messages`);
    url.searchParams.set('limit', '100');
    if (beforeId) url.searchParams.set('before_id', beforeId);
    const res = await fetch(url, { headers: { 'X-Access-Token': token } });
    // 304 once the history runs out; anything else means a fresh or
    // unreadable conversation. Either way, what we have so far is the answer.
    if (!res.ok) break;
    const messages = (await res.json())?.response?.messages ?? [];
    if (messages.length === 0) break;
    out.push(...messages.map((m) => m.source_guid).filter(Boolean));
    if (stopAt && out.some(stopAt)) break;
    beforeId = messages[messages.length - 1].id;
  }
  return out;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const testMode = process.argv.includes('--test');
  const force = process.argv.includes('--force');
  const shuffleMode = process.argv.includes('--shuffle');

  if (!force && !(await registrationIsOpen())) {
    console.log('No registration window open: nothing to post.');
    return;
  }

  const config = await loadUpcomingConfig();
  const token = process.env.GROUPME_TOKEN;
  if (!token) throw new Error('Missing env var GROUPME_TOKEN');

  const DAY_FULL = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday' };

  // What gets counted. A night with a shared team cap (Fall 2026: Tue and Thu
  // at 12 teams) counts as ONE target across both of its divisions, because the
  // Recreational/Competitive split follows signups. Everything else counts per
  // division, by player cap or by team cap.
  const targets = [];
  const nightsDone = new Set();
  for (const division of config.divisions) {
    const nightCap = config.maxTeamsByNight?.[division.day];
    if (nightCap) {
      if (nightsDone.has(division.day)) continue;
      nightsDone.add(division.day);
      targets.push({
        id: `night-${division.day}`,
        day: division.day,
        label: `${DAY_FULL[division.day] ?? division.day} leagues`,
        fullLabel: `${DAY_FULL[division.day] ?? division.day} leagues`,
        cap: nightCap,
        unit: 'teams',
        divisionIds: config.divisions.filter((d) => d.day === division.day).map((d) => d.id),
      });
      continue;
    }
    const playerCap = config.playerCaps[division.id];
    const teamCap = config.maxTeams[division.id];
    const label = `${division.day} ${division.name}`;
    // fullLabel spells the day out ("Wednesday Shuffle"). The digest keeps the
    // terse form so its lines stay inside GroupMe's width; the standalone
    // shuffle post has room to read like a sentence.
    const fullLabel = `${DAY_FULL[division.day] ?? division.day} ${division.name}`;
    const common = { id: division.id, day: division.day, label, fullLabel, divisionIds: [division.id] };
    if (playerCap) {
      targets.push({ ...common, cap: playerCap, unit: 'players' });
    } else if (teamCap) {
      targets.push({ ...common, cap: teamCap, unit: 'teams' });
    }
    // No cap configured for this division: nothing to report.
  }

  const lines = [];
  const divisionsChecked = []; // {id, day, label, fullLabel, count, cap, unit}, in config order
  for (const target of targets) {
    const counts = await Promise.all(
      target.divisionIds.map(async (divId) => (
        target.unit === 'players'
          ? await fetchPlayerCount(config.seasonId, divId)
          : (await fetchTeams(config.seasonId, divId)).length
      ))
    );
    const count = counts.reduce((sum, n) => sum + n, 0);
    const remaining = Math.max(0, target.cap - count);
    const status = remaining === 0 ? 'FULL' : `${remaining} left`;
    lines.push(`${target.label}: ${count}/${target.cap} ${target.unit} (${status})`);
    divisionsChecked.push({
      id: target.id, day: target.day, label: target.label, fullLabel: target.fullLabel,
      count, cap: target.cap, unit: target.unit,
    });
  }

  if (lines.length === 0) {
    console.log('No capped divisions or nights configured: nothing to post.');
    return;
  }
  console.log(lines.join('\n'));

  // ── --shuffle: spots-left nudge in each player-cap night's own group ───────
  // Cadence-driven, not change-driven: the workflow decides when (twice a
  // week), and this only refuses to repeat itself within the same day. A
  // shuffle roster gains and loses a player at a time, so posting on every
  // change would be the daily nagging we just took out of the main group.
  if (shuffleMode) {
    const todayKey = etDateKey(new Date());
    for (const night of divisionsChecked.filter((d) => d.unit === 'players')) {
      const conversationId = testMode ? TEST_CONVERSATION_ID : CONVERSATION_IDS[night.day];
      if (!conversationId) {
        console.log(`No conversation configured for ${night.day}: skipping ${night.label}.`);
        continue;
      }
      const remaining = Math.max(0, night.cap - night.count);
      if (remaining === 0) {
        console.log(`${night.label} is full: nothing to nudge about.`);
        continue;
      }

      // One page is plenty here: this group turns over 100 messages in about
      // ten days, and we only need to know about today.
      const guid = `mv-shufflespots-${night.id}-${todayKey}`;
      const seenHere = new Set(await recentGuids(token, conversationId, { maxPages: 1 }));
      if (seenHere.has(guid)) {
        console.log(`Already posted ${night.label} spots today.`);
        continue;
      }

      const spots = remaining === 1 ? '1 spot' : `${remaining} spots`;
      const message = [
        `🏐 ${night.fullLabel}: ${spots} left for ${config.seasonLabel}`,
        `${night.count} of ${night.cap} players are in. Grab a spot, or send a friend:`,
        REGISTER_PAGE,
        `🤖 Auto-posted by Matt's bot`,
      ].join('\n');

      const where = testMode ? 'TEST group' : `${night.day} group`;
      if (dryRun) {
        console.log(`[dry-run] Would post to the ${where} (guid ${guid}):\n\n${message}\n`);
      } else {
        await postToTopic(token, conversationId, message, null, guid);
        console.log(`Posted to the ${where} (${guid}).`);
      }
    }
    return;
  }

  const conversationId = testMode ? TEST_CONVERSATION_ID : MAIN_GROUP_ID;
  const target = testMode ? 'TEST group' : 'main group';
  const snapshot = divisionsChecked.map((d) => d.count);

  // The season id rides along in the snapshot guid so a baseline never leaks
  // across the season rollover: counts reset to zero at rollover, and a stale
  // full snapshot would otherwise read as "every team dropped" and fire a
  // round of spot-opened alerts on day one of the new season.
  const snapshotPrefix = `mv-regstatus-${config.seasonId}-`;
  const guid = `${snapshotPrefix}${snapshot.join('-')}`;

  /** Counts from a snapshot guid, or null if it isn't one we can trust. */
  const decodeSnapshot = (g) => {
    let body = null;
    if (g.startsWith(snapshotPrefix)) {
      body = g.slice(snapshotPrefix.length);
    } else if (g.startsWith('mv-regstatus-')) {
      // Legacy guid, written before the season id was included. It carries
      // only the counts, so the field count is the only sanity check
      // available; another season's guid fails it and is ignored.
      body = g.slice('mv-regstatus-'.length);
    }
    if (body === null) return null;
    const parts = body.split('-').map(Number);
    const usable = parts.length === divisionsChecked.length && parts.every(Number.isFinite);
    return usable ? parts : null;
  };

  const guids = await recentGuids(token, conversationId, { stopAt: (g) => decodeSnapshot(g) !== null });
  const seen = new Set(guids);
  const toPost = []; // {guid, message}

  // Spot-opened alerts: a division that was at/over cap in the last posted
  // digest and now has room again means someone dropped. Announce it; those
  // spots refill fastest when people hear quickly. Team spots only — a
  // shuffle roster gains and loses individuals all season, so alerting on it
  // would be noise rather than news.
  const lastSnapshot = guids.map(decodeSnapshot).find((counts) => counts !== null) ?? null;
  if (lastSnapshot) {
    for (const [i, division] of divisionsChecked.entries()) {
      if (division.unit !== 'teams') continue;
      if (lastSnapshot[i] >= division.cap && division.count < division.cap) {
        const spotGuid = `mv-spotopen-${division.id}-${division.count}`;
        if (seen.has(spotGuid)) continue;
        toPost.push({
          guid: spotGuid,
          message: [
            `🏐 A spot just opened up in ${division.label} for ${config.seasonLabel}! First come, first served.`,
            `Register: ${REGISTER_PAGE}`,
            `🤖 Auto-posted by Matt's bot`,
          ].join('\n'),
        });
      }
    }
  }

  // Once a digest has gone out saying the team nights are full, that digest was
  // the last word: from here the main group only ever hears a spot-opened
  // alert. Checking what the LAST DIGEST said (rather than what is true now)
  // is what keeps a reopened spot from restarting the daily digest -- the
  // alert above already carried that news, and a digest behind it would just
  // say the same thing twice.
  //
  // Player-cap nights are excluded from the test, so a shuffle roster filling
  // up can never break the silence on its own. Those counts go to the night's
  // own group instead, via --shuffle.
  const teamsFullBefore = lastSnapshot
    && divisionsChecked.every((d, i) => d.unit !== 'teams' || lastSnapshot[i] >= d.cap);

  if (seen.has(guid)) {
    console.log('Counts unchanged since the last digest.');
  } else if (teamsFullBefore) {
    console.log('Team nights were full as of the last digest: main group stays quiet.');
  } else {
    toPost.push({
      guid,
      message: [
        `🏐 ${config.seasonLabel} registration status`,
        '━━━━━━━━━━━━━',
        lines.join('\n'),
        '',
        `Register: ${REGISTER_PAGE}`,
        `🤖 Auto-posted by Matt's bot`,
      ].join('\n'),
    });
  }

  if (toPost.length === 0) {
    console.log('Nothing to post.');
    return;
  }

  for (const post of toPost) {
    if (dryRun) {
      console.log(`[dry-run] Would post to the ${target} (guid ${post.guid}):\n\n${post.message}\n`);
    } else {
      await postToTopic(token, conversationId, post.message, null, post.guid);
      console.log(`Posted to the ${target} (${post.guid}).`);
    }
  }
}

main().catch((err) => {
  console.error('post-registration-status failed:', err);
  process.exit(1);
});
