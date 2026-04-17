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

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr.replace(' ', 'T'));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr.replace(' ', 'T'));
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
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

    const latestClose = entries.reduce((max, e) => {
      const d = e.AssociationRegistration.close_datetime;
      return d > max ? d : max;
    }, entries[0].AssociationRegistration.close_datetime);

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
      const colorClass = dayColors[day] || dayColors.other;
      const open = new Date(reg.open_datetime.replace(' ', 'T'));
      const close = new Date(reg.close_datetime.replace(' ', 'T'));
      const isOpen = now >= open && now <= close;
      const isFuture = now < open;
      const daysLeft = Math.ceil((close.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const regUrl = `https://app.teamlinkt.com/register/go/mattsvolleyball/${reg.id}`;
      return { name: reg.name, colorClass, isOpen, isFuture, daysLeft, regUrl, closeDate: formatDate(reg.close_datetime), openDate: formatDate(reg.open_datetime) };
    });

    return {
      seasonLabel: season.label,
      regStatus,
      seasonDates,
      earliestOpen,
      latestClose,
      regCards,
      hasEntries: true,
    };
  } catch {
    return fallback;
  }
}
