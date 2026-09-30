import { REGISTRATION_SCRAPE_URLS, etNowString } from './seasonConfig';

export interface RegEntry {
  AssociationRegistration: {
    id: number;
    name: string;
    group_name: string;
    open_datetime: string;
    close_datetime: string;
  };
  Season: { id: number; name: string };
}

export interface SeasonGroup {
  label: string;
  children: Record<string, { label: string; children: Record<string, { label: string; children: RegEntry[] }> }>;
}

export interface RegCard {
  name: string;
  divisionLabel: string;
  colorClass: string;
  isOpen: boolean;
  isFuture: boolean;
  daysLeft: number;
  regUrl: string;
  closeDate: string;
  openDate: string;
}

export interface RegistrationData {
  seasonLabel: string;
  regStatus: 'open' | 'coming-soon' | 'in-progress' | 'closed';
  seasonDates: { start: string; end: string } | null;
  earliestOpen: string;
  latestClose: string;
  regCards: RegCard[];
  // True whenever at least one division is accepting signups right now - even
  // if the season is already 'in-progress'. Lets the site keep showing a
  // registration CTA for late-open leagues (e.g. Wednesday shuffle).
  hasOpenRegistration: boolean;
  // Where the primary "Sign Up" CTA should point. When exactly one division is
  // open we deep-link straight to its TeamLinkt registration; otherwise we send
  // people to the leagues page to choose. Empty when nothing is open.
  openRegUrl: string;
  openRegIsExternal: boolean;
  // Day name when exactly one division is open (e.g. "Wednesday"), else ''.
  openRegDay: string;
  // Close date of the NEXT deadline among the forms that are open right now,
  // as a raw datetime string ('' when nothing is open). Use this for any
  // "registration closes" copy. Do not use latestClose: that one follows the
  // Thursday leagues, so it is already in the past once the season starts and
  // only a late-open league (Wednesday shuffle) is still taking signups.
  openRegNextClose: string;
  // True when every listed form is open right now.
  openRegAllOpen: boolean;
  // True when the open forms do not all close on the same day, so a single
  // "registration closes X" line would understate the later ones.
  openRegCloseDatesDiffer: boolean;
  // True when TeamLinkt was reached and parsed successfully - even with zero
  // forms listed (registration genuinely closed). False only on fetch/parse
  // failure, where callers should avoid asserting a closed state.
  registrationKnown: boolean;
}

interface RegistrationOptions {
  preferredSeasonId?: string;
}

const dayOrder: Record<string, number> = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3 };

const dayColors: Record<string, string> = {
  monday: 'bg-emerald-600',
  tuesday: 'bg-coral-500',
  wednesday: 'bg-ocean-500',
  thursday: 'bg-sand-500',
  other: 'bg-ocean-600',
};

export function getDayFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('monday')) return 'monday';
  if (lower.includes('tuesday')) return 'tuesday';
  if (lower.includes('wednesday')) return 'wednesday';
  if (lower.includes('thursday')) return 'thursday';
  return 'other';
}

/** Capitalizes a day key for display; returns '' for the 'other' bucket. */
function capitalize(day: string): string {
  if (!day || day === 'other') return '';
  return day.charAt(0).toUpperCase() + day.slice(1);
}

// TeamLinkt datetimes ('YYYY-MM-DD HH:MM:SS') are Eastern wall-clock times with
// no offset. The build and the Pages Function both run in UTC, where
// `new Date(str)` would land 4-5 hours off, so compare them as strings against
// the current Eastern time instead (see etNowString in seasonConfig).

/** True when the Eastern-time `now` string falls inside [open, close]. */
function isWithin(nowEt: string, open: string, close: string): boolean {
  return open <= nowEt && nowEt <= close;
}

/** 'YYYY-MM-DD' for a human date like "September 17, 2026" (runtime-zone independent). */
function dateKeyFromLabel(label: string): string | null {
  const d = new Date(label);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr.replace(' ', 'T'));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr.replace(' ', 'T'));
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function getDivisionLabel(name: string, groupName: string): string {
  const nameTokens = name.toLowerCase().split(/\s+/).filter(Boolean);
  const groupTokens = groupName.split(/\s+/).filter(Boolean);
  const remainder = groupTokens.filter((token, idx) => {
    if (idx >= nameTokens.length) return true;
    return token.toLowerCase() !== nameTokens[idx];
  }).join(' ').trim().replace(/^[-\s]+/, '');

  return remainder || name;
}

/**
 * Summarises the forms that are open right now: the next deadline, whether all
 * forms are open, and whether they share a close date.
 *
 * Kept separate from the fetch so it can be tested on its own. Wednesday
 * shuffle stays open a few weeks into the season, so "registration closes"
 * copy has to follow the open forms, not the season-wide latest close.
 */
export function summariseOpenRegistration(
  forms: { closeDatetime: string; isOpen: boolean }[],
): { openRegNextClose: string; openRegAllOpen: boolean; openRegCloseDatesDiffer: boolean } {
  const open = forms.filter((f) => f.isOpen);
  if (open.length === 0) {
    return { openRegNextClose: '', openRegAllOpen: false, openRegCloseDatesDiffer: false };
  }
  const closes = open.map((f) => f.closeDatetime).sort();
  const closeDays = new Set(closes.map((c) => c.slice(0, 10)));
  return {
    openRegNextClose: closes[0],
    openRegAllOpen: open.length === forms.length,
    openRegCloseDatesDiffer: closeDays.size > 1,
  };
}

const USER_AGENT = { 'User-Agent': 'MattsVolleyball/1.0' };

/**
 * Scrapes TeamLinkt's grouped registration forms, keyed by season id.
 *
 * TeamLinkt's find page lists only the forms that are open right now, so
 * before registration opens it reports nothing. A page loaded with a `cid`
 * lists the whole season instead. Try those pages in order and take the first
 * one that actually names a form. See REGISTRATION_SCRAPE_URLS.
 *
 * `reachable` is true when at least one page parsed, even if it listed nothing.
 */
export async function fetchRegistrationGroups(): Promise<{ data: Record<string, SeasonGroup> | null; reachable: boolean }> {
  let reachable = false;
  for (const url of REGISTRATION_SCRAPE_URLS) {
    const res = await fetch(url, { headers: USER_AGENT });
    if (!res.ok) continue;
    const html = await res.text();
    // TeamLinkt serves an object keyed by season id when forms exist, and a
    // bare `[]` when none are listed.
    const match = html.match(/season_registration_grouped\s*=\s*(\{[\s\S]*?\}|\[\]);/);
    if (!match) continue;
    reachable = true;
    const parsed: Record<string, SeasonGroup> | unknown[] = JSON.parse(match[1]);
    if (!Array.isArray(parsed) && Object.keys(parsed).length > 0) {
      return { data: parsed as Record<string, SeasonGroup>, reachable };
    }
  }
  return { data: null, reachable };
}

/** Season playing dates from a registration form's detail page. Null when not found. */
export async function fetchSeasonDates(regId: number): Promise<{ start: string; end: string } | null> {
  try {
    const res = await fetch(`https://app.teamlinkt.com/register/go/mattsvolleyball/${regId}`, { headers: USER_AGENT });
    if (!res.ok) return null;
    const html = await res.text();
    // Look specifically for "Season Dates" label followed by date range
    const match = html.match(
      /Season\s+Dates<\/label>[\s\S]*?(\w+\s+\d{1,2},?\s*\d{4})\s*to\s*(\w+\s+\d{1,2},?\s*\d{4})/
    );
    return match ? { start: match[1].trim(), end: match[2].trim() } : null;
  } catch {
    return null; // non-critical
  }
}

export async function getRegistrationData(options: RegistrationOptions = {}): Promise<RegistrationData> {
  const fallback: RegistrationData = {
    seasonLabel: '',
    regStatus: 'closed',
    seasonDates: null,
    earliestOpen: '',
    latestClose: '',
    regCards: [],
    hasOpenRegistration: false,
    openRegUrl: '/leagues/',
    openRegIsExternal: false,
    openRegDay: '',
    openRegNextClose: '',
    openRegAllOpen: false,
    openRegCloseDatesDiffer: false,
    registrationKnown: false,
  };

  try {
    const { data, reachable } = await fetchRegistrationGroups();
    // Reached TeamLinkt but no page listed a form: registration really is closed.
    if (!data) return reachable ? { ...fallback, registrationKnown: true } : fallback;
    const seasonIds = Object.keys(data).sort((a, b) => Number(b) - Number(a));
    if (seasonIds.length === 0) return { ...fallback, registrationKnown: true };

    const selectedSeasonId = (options.preferredSeasonId && data[options.preferredSeasonId])
      ? options.preferredSeasonId
      : seasonIds[0];
    const season = data[selectedSeasonId];
    const entries: RegEntry[] = [];

    for (const eventType of Object.values(season.children)) {
      for (const container of Object.values(eventType.children)) {
        entries.push(...container.children);
      }
    }

    if (entries.length === 0) return { ...fallback, seasonLabel: season.label, registrationKnown: true };

    const nowEt = etNowString();
    const anyOpen = entries.some((e) => isWithin(
      nowEt, e.AssociationRegistration.open_datetime, e.AssociationRegistration.close_datetime,
    ));
    const allFuture = entries.every((e) => nowEt < e.AssociationRegistration.open_datetime);

    let regStatus: RegistrationData['regStatus'] = anyOpen ? 'open' : allFuture ? 'coming-soon' : 'closed';

    const earliestOpen = entries.reduce((min, e) => {
      const d = e.AssociationRegistration.open_datetime;
      return d < min ? d : min;
    }, entries[0].AssociationRegistration.open_datetime);

    const latestCloseOverall = entries.reduce((max, e) => {
      const d = e.AssociationRegistration.close_datetime;
      return d > max ? d : max;
    }, entries[0].AssociationRegistration.close_datetime);

    // Wednesday registration may stay open longer, but sitewide close-date copy
    // should follow Thursday leagues when available.
    const thursdayEntries = entries.filter((e) => getDayFromName(e.AssociationRegistration.name) === 'thursday');
    const latestClose = thursdayEntries.length > 0
      ? thursdayEntries.reduce((max, e) => {
        const d = e.AssociationRegistration.close_datetime;
        return d > max ? d : max;
      }, thursdayEntries[0].AssociationRegistration.close_datetime)
      : latestCloseOverall;

    // Sort by day of week
    entries.sort((a, b) => {
      const da = dayOrder[getDayFromName(a.AssociationRegistration.name)] ?? 99;
      const db = dayOrder[getDayFromName(b.AssociationRegistration.name)] ?? 99;
      return da - db;
    });

    // Fetch season playing dates from a detail page
    const firstId = entries[0]?.AssociationRegistration.id;
    const seasonDates = firstId ? await fetchSeasonDates(firstId) : null;

    const startKey = seasonDates && dateKeyFromLabel(seasonDates.start);
    const endKey = seasonDates && dateKeyFromLabel(seasonDates.end);
    if (startKey && endKey) {
      const todayEt = nowEt.slice(0, 10);
      if (todayEt >= startKey && todayEt <= endKey) {
        regStatus = 'in-progress';
      } else if (todayEt > endKey) {
        regStatus = 'closed';
      }
    }

    // Precompute card data
    const regCards: RegCard[] = entries.map((e) => {
      const reg = e.AssociationRegistration;
      const day = getDayFromName(reg.name);
      const divisionLabel = getDivisionLabel(reg.name, reg.group_name);
      const colorClass = dayColors[day] || dayColors.other;
      const isOpen = isWithin(nowEt, reg.open_datetime, reg.close_datetime);
      const isFuture = nowEt < reg.open_datetime;
      // Both sides are Eastern wall-clock strings, so read them in the same
      // (arbitrary) zone and the difference is exact.
      const asUtc = (str: string) => Date.parse(`${str.replace(' ', 'T')}Z`);
      const daysLeft = Math.ceil((asUtc(reg.close_datetime) - asUtc(nowEt)) / (1000 * 60 * 60 * 24));
      const regUrl = `https://app.teamlinkt.com/register/go/mattsvolleyball/${reg.id}`;
      return { name: reg.name, divisionLabel, colorClass, isOpen, isFuture, daysLeft, regUrl, closeDate: formatDate(reg.close_datetime), openDate: formatDate(reg.open_datetime) };
    });

    // Surface open registration independently of the season-level status: a
    // season can be 'in-progress' while a late-open league (e.g. Wednesday
    // shuffle, which re-drafts weekly) still accepts signups.
    const openCards = regCards.filter((c) => c.isOpen);
    const hasOpenRegistration = openCards.length > 0;
    const openRegIsExternal = openCards.length === 1;
    const openRegUrl = openRegIsExternal ? openCards[0].regUrl : '/leagues/';
    const openRegDay = openCards.length === 1
      ? capitalize(getDayFromName(openCards[0].name))
      : '';
    const openRegSummary = summariseOpenRegistration(
      entries.map((e) => {
        const reg = e.AssociationRegistration;
        return { closeDatetime: reg.close_datetime, isOpen: isWithin(nowEt, reg.open_datetime, reg.close_datetime) };
      }),
    );

    return {
      seasonLabel: season.label,
      regStatus,
      seasonDates,
      earliestOpen,
      latestClose,
      regCards,
      hasOpenRegistration,
      openRegUrl,
      openRegIsExternal,
      openRegDay,
      ...openRegSummary,
      registrationKnown: true,
    };
  } catch {
    return fallback;
  }
}
