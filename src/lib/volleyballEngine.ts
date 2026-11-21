import type { EngineBracket, EngineMatch } from './bracket';

// Playoff nights are run in VolleyballEngine, which records results and
// advances winners. Its playoff tables are public-read, so the playoffs page
// reads them straight from its Supabase REST API. This key is the publishable
// one VolleyballEngine already ships to every browser; it only grants what
// the tables' read policies allow.
const SUPABASE_URL = 'https://enbnplqyjzewairxgcxe.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_N8HEA_JpvgYoAubpoZE4Jw_6nQijeGE';

export interface EnginePlayoffNight {
  id: string;
  name: string;
  event_date: string;
  playoff_brackets: (EngineBracket & { playoff_matches: EngineMatch[] })[];
}

/**
 * Playoff nights on or after `since` (YYYY-MM-DD), oldest first. Only the
 * league's own director can create playoff events in VolleyballEngine, so a
 * date window alone picks out this league's nights.
 */
export async function fetchPlayoffNights(since: string): Promise<EnginePlayoffNight[]> {
  const params = new URLSearchParams({
    select: 'id,name,event_date,playoff_brackets(id,division_name,team_count,seeds,display_order,playoff_matches(*))',
    event_date: `gte.${since}`,
    order: 'event_date.asc',
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/playoff_events?${params}`, {
    headers: { apikey: PUBLISHABLE_KEY },
  });
  if (!res.ok) throw new Error(`VolleyballEngine returned ${res.status}`);
  return res.json();
}
