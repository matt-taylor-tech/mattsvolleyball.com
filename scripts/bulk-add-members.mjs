// Bulk-add registered players to GroupMe groups from a TeamLinkt
// registration CSV export (issue #19).
//
// SAFETY: DRY-RUN BY DEFAULT. Without --send this script makes no write
// calls at all: it parses the CSV, fetches current group members (read-only,
// for dedupe), and prints the add plan. Nothing is sent to anyone.
//
// Routing: every active registrant goes to the main league group; rows whose
// division matches an extra route (Wednesday Shuffle) ALSO go to that group.
//
// Usage: node scripts/bulk-add-members.mjs <export.csv> [--test] [--send]
//   --test   route everything to the Bot Test Group instead of real groups
//   --send   actually add members (asks GroupMe, reports per-person results)
// Env:  GROUPME_TOKEN  required (member list reads and adds)

import { readFile } from 'node:fs/promises';

const MAIN_GROUP = { id: '115950918', label: 'main league group' };
const EXTRA_ROUTES = [
  { match: /wednesday shuffle/i, id: '115951034', label: 'Wednesday Shuffle group' },
];
const TEST_GROUP = { id: '115965602', label: 'Bot Test Group' };
const BATCH_SIZE = 50; // members per add call

// ── CSV parsing (RFC 4180: quoted fields, embedded commas/quotes/newlines) ───

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function toRecords(rows) {
  const header = rows[0];
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

// ── Registrant extraction ─────────────────────────────────────────────────────

/** "(505) 610-0362" -> "+1 5056100362"; returns null if not a 10-digit US number. */
function normalizePhone(raw) {
  let digits = (raw || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits.length === 10 ? `+1 ${digits}` : null;
}

function extractRegistrants(records) {
  const registrants = [];
  const skipped = [];
  for (const rec of records) {
    const name = `${rec['First Name']} ${rec['Last Name']}`.trim();
    const division = rec['Division Name'] || rec['Form Name'] || '';
    if ((rec['Status'] || '').toLowerCase() !== 'active') {
      skipped.push(`${name}: status "${rec['Status']}"`);
      continue;
    }
    const phone = normalizePhone(rec['Phone']);
    if (!phone) {
      skipped.push(`${name}: unusable phone "${rec['Phone']}"`);
      continue;
    }
    registrants.push({ name, phone, division });
  }
  return { registrants, skipped };
}

// ── GroupMe ───────────────────────────────────────────────────────────────────

async function api(token, path, options = {}) {
  const res = await fetch(`https://api.groupme.com/v3${path}`, {
    ...options,
    headers: { 'X-Access-Token': token, 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) throw new Error(`GroupMe ${path} failed: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()).response;
}

/** Phone numbers aren't exposed on the member list, so dedupe is by nickname. */
async function fetchMemberNames(token, groupId) {
  const group = await api(token, `/groups/${groupId}`);
  return new Set((group.members || []).map((m) => m.nickname.toLowerCase()));
}

async function addMembers(token, groupId, members) {
  const outcomes = { added: [], failed: [] };
  for (let i = 0; i < members.length; i += BATCH_SIZE) {
    const batch = members.slice(i, i + BATCH_SIZE);
    const { results_id } = await api(token, `/groups/${groupId}/members/add`, {
      method: 'POST',
      body: JSON.stringify({
        members: batch.map((m) => ({ nickname: m.name, phone_number: m.phone })),
      }),
    });
    // Results are eventually consistent; poll briefly.
    let results = null;
    for (let attempt = 0; attempt < 10 && !results; attempt++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        results = await api(token, `/groups/${groupId}/members/results/${results_id}`);
      } catch {
        // 503 while processing; retry
      }
    }
    if (!results) {
      outcomes.failed.push(...batch.map((m) => `${m.name}: no result after polling`));
      continue;
    }
    outcomes.added.push(...(results.members || []).map((m) => m.nickname));
    outcomes.failed.push(...(results.failed || []).map((f) => JSON.stringify(f)));
  }
  return outcomes;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const send = args.includes('--send');
  const testMode = args.includes('--test');
  const csvPath = args.find((a) => !a.startsWith('--'));
  if (!csvPath) throw new Error('Usage: node scripts/bulk-add-members.mjs <export.csv> [--test] [--send]');

  const token = process.env.GROUPME_TOKEN;
  if (!token) throw new Error('Missing env var GROUPME_TOKEN');

  const { registrants, skipped } = extractRegistrants(toRecords(parseCsv(await readFile(csvPath, 'utf8'))));

  // Build per-group plans. Everyone -> main group; matching divisions also get
  // their extra group. In test mode everything collapses to the test group.
  const plans = new Map(); // groupId -> { label, members: [] }
  const routeTo = (group, registrant) => {
    const target = testMode ? TEST_GROUP : group;
    if (!plans.has(target.id)) plans.set(target.id, { label: target.label, members: [], seen: new Set() });
    const plan = plans.get(target.id);
    if (plan.seen.has(registrant.phone)) return;
    plan.seen.add(registrant.phone);
    plan.members.push(registrant);
  };
  for (const r of registrants) {
    routeTo(MAIN_GROUP, r);
    for (const route of EXTRA_ROUTES) {
      if (route.match.test(r.division)) routeTo(route, r);
    }
  }

  console.log(`Parsed ${registrants.length} active registrant(s) from ${csvPath}`);
  for (const s of skipped) console.log(`  skipped: ${s}`);

  for (const [groupId, plan] of plans) {
    const existing = await fetchMemberNames(token, groupId);
    const toAdd = plan.members.filter((m) => !existing.has(m.name.toLowerCase()));
    const already = plan.members.length - toAdd.length;

    console.log(`\n${plan.label} (${groupId}): ${toAdd.length} to add${already ? `, ${already} already members (matched by name)` : ''}`);
    for (const m of toAdd) console.log(`  + ${m.name}  ${m.phone}  [${m.division}]`);

    if (!send) continue;
    if (toAdd.length === 0) continue;

    const { added, failed } = await addMembers(token, groupId, toAdd);
    console.log(`  -> added ${added.length}: ${added.join(', ')}`);
    for (const f of failed) console.log(`  -> FAILED: ${f}`);
  }

  if (!send) {
    console.log('\nDRY RUN ONLY - no one was added or contacted. Pass --send to execute.');
  }
}

main().catch((err) => {
  console.error('bulk-add-members failed:', err);
  process.exit(1);
});
