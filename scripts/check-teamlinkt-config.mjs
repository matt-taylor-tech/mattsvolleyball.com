import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SEASON_CONFIG_PATH = path.resolve(__dirname, '../src/lib/seasonConfig.ts');

function extractSingleId(source, varName) {
  const re = new RegExp(`const\\s+${varName}\\s*=\\s*\\{[\\s\\S]*?id:\\s*'([0-9]+)'`, 'm');
  const match = source.match(re);
  return match ? match[1] : null;
}

function extractDivisionIds(source, varName) {
  const blockRe = new RegExp(`const\\s+${varName}:[^=]*=\\s*\\[([\\s\\S]*?)\\];`, 'm');
  const block = source.match(blockRe)?.[1] ?? '';
  return [...block.matchAll(/id:\s*'([0-9]+)'/g)].map((m) => m[1]);
}

function extractSelectOptions(html, selectId) {
  const selectMatch = html.match(new RegExp(`<select[^>]*id="${selectId}"[^>]*>([\\s\\S]*?)<\\/select>`, 'i'));
  if (!selectMatch) return [];
  return [...selectMatch[1].matchAll(/<option\s+value="([^"]*)"/g)].map((m) => m[1]).filter(Boolean);
}

async function checkDivisionEndpoint(baseUrl, orgId, seasonId, divisionId) {
  const url = `${baseUrl}/getTeams/${orgId}/${seasonId}`;
  const body = new URLSearchParams();
  body.set('group_ids[division]', divisionId);
  body.set('season_id', seasonId);

  const res = await fetch(url, { method: 'POST', body });
  if (!res.ok) {
    return `HTTP ${res.status} for season ${seasonId} division ${divisionId}`;
  }

  let payload;
  try {
    payload = await res.json();
  } catch {
    return `Non-JSON response for season ${seasonId} division ${divisionId}`;
  }

  if (!Array.isArray(payload)) {
    return `Unexpected payload type for season ${seasonId} division ${divisionId}`;
  }

  return null;
}

async function main() {
  const source = await readFile(SEASON_CONFIG_PATH, 'utf8');

  const currentSeasonId = extractSingleId(source, 'CURRENT_SEASON');
  const nextSeasonId = extractSingleId(source, 'NEXT_SEASON');
  const currentDivisionIds = extractDivisionIds(source, 'CURRENT_DIVISIONS');
  const upcomingDivisionIds = extractDivisionIds(source, 'UPCOMING_DIVISIONS');

  if (!currentSeasonId || !nextSeasonId || currentDivisionIds.length === 0 || upcomingDivisionIds.length === 0) {
    console.error('Unable to parse season IDs/divisions from src/lib/seasonConfig.ts');
    process.exit(1);
  }

  const orgId = '10757';
  const appBase = 'https://app.mattsvolleyball.com/leagues';
  const scheduleUrl = 'https://app.mattsvolleyball.com/mattsvolleyball/Schedule';

  const html = await fetch(scheduleUrl).then((r) => r.text());
  const seasonOptions = extractSelectOptions(html, 'season_id');
  const divisionOptions = extractSelectOptions(html, 'hierarchy_filter');

  const issues = [];

  if (!seasonOptions.includes(currentSeasonId)) {
    issues.push(`Current season ${currentSeasonId} not found in TeamLinkt season dropdown`);
  }
  if (!seasonOptions.includes(nextSeasonId)) {
    issues.push(`Upcoming season ${nextSeasonId} not found in TeamLinkt season dropdown`);
  }

  const dropdownOnlyWarnings = [];
  for (const id of currentDivisionIds) {
    if (!divisionOptions.includes(id)) {
      dropdownOnlyWarnings.push(`Current division ${id} not shown in the default dropdown view`);
    }
  }
  for (const id of upcomingDivisionIds) {
    if (!divisionOptions.includes(id)) {
      dropdownOnlyWarnings.push(`Upcoming division ${id} not shown in the default dropdown view`);
    }
  }

  for (const id of currentDivisionIds) {
    const err = await checkDivisionEndpoint(appBase, orgId, currentSeasonId, id);
    if (err) issues.push(err);
  }
  for (const id of upcomingDivisionIds) {
    const err = await checkDivisionEndpoint(appBase, orgId, nextSeasonId, id);
    if (err) issues.push(err);
  }

  if (issues.length > 0) {
    console.error('TeamLinkt preflight failed:');
    for (const issue of issues) console.error(`- ${issue}`);
    process.exit(1);
  }

  console.log('TeamLinkt preflight passed.');
  console.log(`Current season: ${currentSeasonId} (${currentDivisionIds.length} divisions)`);
  console.log(`Upcoming season: ${nextSeasonId} (${upcomingDivisionIds.length} divisions)`);
  for (const warning of dropdownOnlyWarnings) {
    console.warn(`Warning: ${warning}`);
  }
}

main().catch((err) => {
  console.error('TeamLinkt preflight crashed:', err);
  process.exit(1);
});
