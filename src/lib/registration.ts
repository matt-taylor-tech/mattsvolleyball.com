import { REGISTRATION_SCRAPE_URLS } from './seasonConfig';

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

interface SeasonGroup {
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
    // TeamLinkt's find page lists only the forms that are open right now, so
    // before registration opens it reports nothing. A page loaded with a `cid`
    // lists the whole season instead. Try those pages in order and take the
    // first one that actually names a form. See REGISTRATION_SCRAPE_URLS.
    let data: Record<string, SeasonGroup> | null = null;
    let parsedAny = false;
    for (const url of REGISTRATION_SCRAPE_URLS) {
      const res = await fetch(url, { headers: { 'User-Agent': 'MattsVolleyball/1.0' } });
      if (!res.ok) continue;
      const html = await res.text();
      // TeamLinkt serves an object keyed by season id when forms exist, and a
      // bare `[]` when none are listed.
      const match = html.match(/season_registration_grouped\s*=\s*(\{[\s\S]*?\}|\[\]);/);
      if (!match) continue;
      parsedAny = true;
      const parsed: Record<string, SeasonGroup> | unknown[] = JSON.parse(match[1]);
      if (!Array.isArray(parsed) && Object.keys(parsed).length > 0) {
        data = parsed as Record<string, SeasonGroup>;
        break;
      }
    }
    // Reached TeamLinkt but no page listed a form: registration really is closed.
    if (!data) return parsedAny ? { ...fallback, registrationKnown: true } : fallback;
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

    const now = new Date();
    const anyOpen = entries.some((e) => {
      const open = new Date(e.AssociationRegistration.open_datetime.replace(' ', 'T'));
      const close = new Date(e.AssociationRegistration.close_datetime.replace(' ', 'T'));
      return now >= open && now <= close;
    });
    const allFuture = entries.every((e) => {
      const open = new Date(e.AssociationRegistration.open_datetime.replace(' ', 'T'));
      return now < open;
    });

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
    let seasonDates: { start: string; end: string } | null = null;
    const firstId = entries[0]?.AssociationRegistration.id;
    if (firstId) {
      try {
        const detailRes = await fetch(
          `https://app.teamlinkt.com/register/go/mattsvolleyball/${firstId}`,
          { headers: { 'User-Agent': 'MattsVolleyball/1.0' } },
        );
        const detailHtml = await detailRes.text();
        // Look specifically for "Season Dates" label followed by date range
        const seasonDatesMatch = detailHtml.match(
          /Season\s+Dates<\/label>[\s\S]*?(\w+\s+\d{1,2},?\s*\d{4})\s*to\s*(\w+\s+\d{1,2},?\s*\d{4})/
        );
        if (seasonDatesMatch) {
          seasonDates = { start: seasonDatesMatch[1].trim(), end: seasonDatesMatch[2].trim() };
        }
      } catch { /* non-critical */ }
    }

    // If the season has started, override status to in-progress
    if (seasonDates) {
      const startDate = new Date(seasonDates.start);
      const endDate = new Date(seasonDates.end);
      if (now >= startDate && now <= endDate) {
        regStatus = 'in-progress';
      } else if (now > endDate) {
        regStatus = 'closed';
      }
    }

    // Precompute card data
    const regCards: RegCard[] = entries.map((e) => {
      const reg = e.AssociationRegistration;
      const day = getDayFromName(reg.name);
      const divisionLabel = getDivisionLabel(reg.name, reg.group_name);
      const colorClass = dayColors[day] || dayColors.other;
      const open = new Date(reg.open_datetime.replace(' ', 'T'));
      const close = new Date(reg.close_datetime.replace(' ', 'T'));
      const isOpen = now >= open && now <= close;
      const isFuture = now < open;
      const daysLeft = Math.ceil((close.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
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
        const open = new Date(reg.open_datetime.replace(' ', 'T'));
        const close = new Date(reg.close_datetime.replace(' ', 'T'));
        return { closeDatetime: reg.close_datetime, isOpen: now >= open && now <= close };
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
