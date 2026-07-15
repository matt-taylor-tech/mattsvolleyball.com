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

async function recentGuids(token, conversationId) {
  const res = await fetch(
    `https://api.groupme.com/v3/groups/${conversationId}/messages?limit=100`,
    { headers: { 'X-Access-Token': token } },
  );
  if (!res.ok) return new Set(); // fresh conversation; treat as no history
  const messages = (await res.json())?.response?.messages ?? [];
  return new Set(messages.map((m) => m.source_guid).filter(Boolean));
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
  const snapshot = [];
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
    snapshot.push(count);
  }

  if (lines.length === 0) {
    console.log('No capped divisions configured: nothing to post.');
    return;
  }
  console.log(lines.join('\n'));

  const conversationId = testMode ? TEST_CONVERSATION_ID : MAIN_GROUP_ID;
  const target = testMode ? 'TEST group' : 'main group';
  const guid = `mv-regstatus-${snapshot.join('-')}`;

  const seen = await recentGuids(token, conversationId);
  if (seen.has(guid)) {
    console.log('Counts unchanged since the last post: nothing to post.');
    return;
  }

  const message = [
    `🏐 ${config.seasonLabel} registration status`,
    '━━━━━━━━━━━━━',
    lines.join('\n'),
    '',
    `Register: ${REGISTER_PAGE}`,
    `🤖 Auto-posted by Matt's bot`,
  ].join('\n');

  if (dryRun) {
    console.log(`[dry-run] Would post to the ${target} (guid ${guid}):\n\n${message}`);
    return;
  }

  await postToTopic(token, conversationId, message, null, guid);
  console.log(`Posted registration status to the ${target}.`);
}

main().catch((err) => {
  console.error('post-registration-status failed:', err);
  process.exit(1);
});
