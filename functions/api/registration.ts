import { fetchRegistrationGroups, fetchSeasonDates } from '../../src/lib/registration';

// Full scraped registration data as JSON. Shares the scraping code with
// src/lib/registration.ts so both agree on which TeamLinkt page to read.
export const onRequestGet: PagesFunction = async () => {
  try {
    const { data, reachable } = await fetchRegistrationGroups();
    if (!data) {
      return reachable
        ? Response.json({ seasons: {}, seasonDates: null }, { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300', 'Access-Control-Allow-Origin': '*' } })
        : Response.json({ error: 'No registration data found' }, { status: 502 });
    }

    // Season dates come from the first form's detail page.
    let firstRegId: number | null = null;
    for (const season of Object.values(data)) {
      for (const eventType of Object.values(season.children)) {
        for (const container of Object.values(eventType.children)) {
          firstRegId ??= container.children?.[0]?.AssociationRegistration?.id ?? null;
        }
      }
    }
    const seasonDates = firstRegId ? await fetchSeasonDates(firstRegId) : null;

    return Response.json({ seasons: data, seasonDates }, {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return Response.json({ error: 'Failed to fetch registration data' }, { status: 500 });
  }
};
