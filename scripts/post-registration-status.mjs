// Registration status post (issue #13). While a registration window is open
// (live from the TeamLinkt register page), posts a per-division spots
// summary with the signup link to the main league group, but only when the
// counts have changed since the last post.
//
// Stateless dedupe: the message's source_guid encodes the counts snapshot,
// and recent group messages are scanned for it before posting. Counts only
// grow, so an unchanged snapshot means nothing new to say.
//
// Env:  GROUPME_TOKEN    user access token
// Args: --dry-run     print instead of posting
//       --force       skip the registration-window gate (testing)
//       --test        route posts to the Bot Test Group

import {
  API_BASE, ORG_ID, MAIN_GROUP_ID, TEST_CONVERSATION_ID, TIME_ZONE,
  loadUpcomingConfig, postForm, postToTopic,
} from './lib/mv.mjs';

const REGISTER_PAGE = 'https://app.teamlinkt.com/register/find/mattsvolleyball';

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
  const res = await fetch(REGISTER_PAGE, { headers: { 'User-Agent': 'MattsVolleyball/1.0' } });
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

/** source_guids of recent messages, newest first. */
async function recentGuids(token, conversationId) {
  const res = await fetch(
    `https://api.groupme.com/v3/groups/${conversationId}/messages?limit=100`,
    { headers: { 'X-Access-Token': token } },
  );
  if (!res.ok) return []; // fresh conversation; treat as no history
  const messages = (await res.json())?.response?.messages ?? [];
  return messages.map((m) => m.source_guid).filter(Boolean);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const testMode = process.argv.includes('--test');
  const force = process.argv.includes('--force');

  if (!force && !(await registrationIsOpen())) {
    console.log('No registration window open: nothing to post.');
    return;
  }

  const config = await loadUpcomingConfig();
  const token = process.env.GROUPME_TOKEN;
  if (!token) throw new Error('Missing env var GROUPME_TOKEN');

  const lines = [];
  const divisionsChecked = []; // {label, count, cap} in stable config order
  for (const division of config.divisions) {
    const label = `${division.day} ${division.name}`;
    const playerCap = config.playerCaps[division.id];
    const teamCap = config.maxTeams[division.id];

    let count, cap, unit;
    if (playerCap) {
      count = await fetchPlayerCount(config.seasonId, division.id);
      cap = playerCap; unit = 'players';
    } else if (teamCap) {
      count = (await fetchTeams(config.seasonId, division.id)).length;
      cap = teamCap; unit = 'teams';
    } else {
      continue; // no cap configured for this division
    }

    const remaining = Math.max(0, cap - count);
    const status = remaining === 0 ? 'FULL' : `${remaining} left`;
    lines.push(`${label}: ${count}/${cap} ${unit} (${status})`);
    divisionsChecked.push({ id: division.id, label, count, cap });
  }

  if (lines.length === 0) {
    console.log('No capped divisions configured: nothing to post.');
    return;
  }
  console.log(lines.join('\n'));

  const conversationId = testMode ? TEST_CONVERSATION_ID : MAIN_GROUP_ID;
  const target = testMode ? 'TEST group' : 'main group';
  const snapshot = divisionsChecked.map((d) => d.count);
  const guid = `mv-regstatus-${snapshot.join('-')}`;

  const guids = await recentGuids(token, conversationId);
  const seen = new Set(guids);
  const toPost = []; // {guid, message}

  // Spot-opened alerts: a division that was at/over cap in the last posted
  // digest and now has room again means someone dropped. Announce it; those
  // spots refill fastest when people hear quickly.
  const lastSnapshot = guids
    .find((g) => g.startsWith('mv-regstatus-'))
    ?.slice('mv-regstatus-'.length).split('-').map(Number);
  if (lastSnapshot && lastSnapshot.length === divisionsChecked.length) {
    for (const [i, division] of divisionsChecked.entries()) {
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

  // Once the league is full and the FULL digest has posted, stay quiet even
  // if raw counts drift (e.g. an over-cap add): the message would read the
  // same. The next post is the spot-opened alert, when there's actual news.
  const allFullNow = divisionsChecked.every((d) => d.count >= d.cap);
  const allFullBefore = lastSnapshot
    && lastSnapshot.length === divisionsChecked.length
    && divisionsChecked.every((d, i) => lastSnapshot[i] >= d.cap);

  if (seen.has(guid)) {
    console.log('Counts unchanged since the last digest.');
  } else if (allFullNow && allFullBefore) {
    console.log('Still fully booked; FULL digest already posted.');
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
