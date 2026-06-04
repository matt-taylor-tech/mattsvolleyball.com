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
  hasEntries: boolean;
  // True whenever at least one division is accepting signups right now — even
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
  }).join(' ').trim();

  return remainder || name;
}

export async function getRegistrationData(options: RegistrationOptions = {}): Promise<RegistrationData> {
  const fallback: RegistrationData = {
    seasonLabel: '',
    regStatus: 'closed',
    seasonDates: null,
    earliestOpen: '',
    latestClose: '',
    regCards: [],
    hasEntries: false,
    hasOpenRegistration: false,
    openRegUrl: '/leagues/',
    openRegIsExternal: false,
    openRegDay: '',
  };

  try {
    const res = await fetch('https://app.teamlinkt.com/register/find/mattsvolleyball', {
      headers: { 'User-Agent': 'MattsVolleyball/1.0' },
    });
    const html = await res.text();
    const match = html.match(/season_registration_grouped\s*=\s*(\{[\s\S]*?\});\s*\n/);
    if (!match) return fallback;

    const data: Record<string, SeasonGroup> = JSON.parse(match[1]);
    const seasonIds = Object.keys(data).sort((a, b) => Number(b) - Number(a));
    if (seasonIds.length === 0) return fallback;

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

    if (entries.length === 0) return { ...fallback, seasonLabel: season.label };

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

    return {
      seasonLabel: season.label,
      regStatus,
      seasonDates,
      earliestOpen,
      latestClose,
      regCards,
      hasEntries: true,
      hasOpenRegistration,
      openRegUrl,
      openRegIsExternal,
      openRegDay,
    };
  } catch {
    return fallback;
  }
}
