import { REGISTRATION_SCRAPE_URLS } from '../../src/lib/seasonConfig';

export const onRequestGet: PagesFunction = async () => {
  try {
    // Uses the same cid-bearing page as src/lib/registration.ts. See that file.
    const res = await fetch(REGISTRATION_SCRAPE_URLS[0], {
      headers: { 'User-Agent': 'MattsVolleyball/1.0' },
    });
    const html = await res.text();

    const match = html.match(/season_registration_grouped\s*=\s*(\{[\s\S]*?\});\s*\n/);
    if (!match) {
      return Response.json({ error: 'No registration data found' }, { status: 404 });
    }

    const data = JSON.parse(match[1]);

    // Find the first registration ID to fetch season dates
    let firstRegId: number | null = null;
    for (const season of Object.values(data) as any[]) {
      for (const eventType of Object.values(season.children) as any[]) {
        for (const container of Object.values(eventType.children) as any[]) {
          if (container.children?.[0]?.AssociationRegistration?.id) {
            firstRegId = container.children[0].AssociationRegistration.id;
            break;
          }
        }
        if (firstRegId) break;
      }
      if (firstRegId) break;
    }

    // Fetch the registration detail page to extract season start/end dates
    let seasonDates: { start: string; end: string } | null = null;
    if (firstRegId) {
      try {
        const detailRes = await fetch(
          `https://app.teamlinkt.com/register/go/mattsvolleyball/${firstRegId}`,
          { headers: { 'User-Agent': 'MattsVolleyball/1.0' } }
        );
        const detailHtml = await detailRes.text();

        // Look for season date range pattern like "March 17, 2026 to May 14, 2026"
        // or "Mar 17 - May 14, 2026" in the page
        const dateMatch = detailHtml.match(
          /(\w+ \d{1,2},?\s*\d{4})\s*(?:to|-|–|-)\s*(\w+ \d{1,2},?\s*\d{4})/
        );
        if (dateMatch) {
          seasonDates = { start: dateMatch[1].trim(), end: dateMatch[2].trim() };
        }
      } catch {
        // Non-critical, continue without dates
      }
    }

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
