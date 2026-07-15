// Registration spots-remaining alerts (issue #13). Checks the UPCOMING
// season's live TeamLinkt counts against the caps in seasonConfig and posts
// to the main league group when a division is nearly full or just filled.
//
// Each (division, remaining) pair posts at most once, with no state files:
// the message's source_guid encodes the pair, and recent group messages are
// scanned for it before posting. Counts only grow, so passing a threshold
// fires once per value.
//
// Env:  GROUPME_TOKEN    user access token
// Args: --dry-run     print instead of posting
//       --report      include every capped division's current count (ad-hoc
//                     status check; alerts-only is the default)
//       --test        route posts to the Bot Test Group

import {
  API_BASE, ORG_ID, MAIN_GROUP_ID, TEST_CONVERSATION_ID,
  loadUpcomingConfig, postForm, postToTopic,
} from './lib/mv.mjs';

const ALERT_AT_TEAMS = 2;   // alert when this many team spots (or fewer) remain
const ALERT_AT_PLAYERS = 4; // same for player-capped (shuffle) divisions

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
  if (!res.ok) return new Set(); // fresh conversation returns 304; treat as no history
  const messages = (await res.json())?.response?.messages ?? [];
  return new Set(messages.map((m) => m.source_guid).filter(Boolean));
}

function alertText(label, seasonLabel, remaining, unit) {
  if (remaining <= 0) return `🏐 ${label} is FULL for ${seasonLabel}!`;
  const spots = remaining === 1 ? `1 ${unit} spot` : `${remaining} ${unit} spots`;
  return `🏐 Heads up: only ${spots} left in ${label} for ${seasonLabel}!`;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const testMode = process.argv.includes('--test');
  const report = process.argv.includes('--report');

  const config = await loadUpcomingConfig();
  const token = process.env.GROUPME_TOKEN;
  if (!token) throw new Error('Missing env var GROUPME_TOKEN');

  const conversationId = testMode ? TEST_CONVERSATION_ID : MAIN_GROUP_ID;
  const target = testMode ? 'TEST group' : 'main group';
  const seen = await recentGuids(token, conversationId);

  const statusLines = [];
  const alerts = []; // {guid, text}

  for (const division of config.divisions) {
    const label = `${division.day} ${division.name}`;
    const playerCap = config.playerCaps[division.id];
    const teamCap = config.maxTeams[division.id];

    let count, cap, unit, alertAt;
    if (playerCap) {
      count = await fetchPlayerCount(config.seasonId, division.id);
      cap = playerCap; unit = 'player'; alertAt = ALERT_AT_PLAYERS;
    } else if (teamCap) {
      count = (await fetchTeams(config.seasonId, division.id)).length;
      cap = teamCap; unit = 'team'; alertAt = ALERT_AT_TEAMS;
    } else {
      continue; // no cap configured for this division
    }

    const remaining = Math.max(0, cap - count);
    statusLines.push(`${label}: ${count}/${cap} ${unit}s (${remaining} left)`);

    if (remaining <= alertAt) {
      alerts.push({
        guid: `mv-regalert-${division.id}-${remaining}`,
        text: alertText(label, config.seasonLabel, remaining, unit),
      });
    }
  }

  console.log(statusLines.join('\n'));

  const fresh = alerts.filter((a) => !seen.has(a.guid));
  const skipped = alerts.length - fresh.length;
  if (skipped > 0) console.log(`${skipped} alert(s) already posted; skipped.`);

  const toPost = [...fresh];
  if (report) {
    toPost.push({
      guid: `mv-regreport-${Date.now()}`,
      text: `🏐 ${config.seasonLabel} registration status\n━━━━━━━━━━━━━\n${statusLines.join('\n')}`,
    });
  }

  if (toPost.length === 0) {
    console.log('No alerts to post.');
    return;
  }

  for (const alert of toPost) {
    const message = `${alert.text}\n🤖 Auto-posted by Matt's bot`;
    if (dryRun) {
      console.log(`[dry-run] Would post to the ${target} (guid ${alert.guid}):\n${message}\n`);
    } else {
      await postToTopic(token, conversationId, message, null, alert.guid);
      console.log(`Posted to the ${target}: ${alert.text}`);
    }
  }
}

main().catch((err) => {
  console.error('post-registration-alerts failed:', err);
  process.exit(1);
});
