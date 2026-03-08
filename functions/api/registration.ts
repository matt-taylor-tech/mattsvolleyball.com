export const onRequestGet: PagesFunction = async () => {
  try {
    const res = await fetch('https://app.teamlinkt.com/register/find/mattsvolleyball', {
      headers: { 'User-Agent': 'MattsVolleyball/1.0' },
    });
    const html = await res.text();

    const match = html.match(/season_registration_grouped\s*=\s*(\{[\s\S]*?\});\s*\n/);
    if (!match) {
      return Response.json({ error: 'No registration data found' }, { status: 404 });
    }

    const data = JSON.parse(match[1]);

    return Response.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return Response.json({ error: 'Failed to fetch registration data' }, { status: 500 });
  }
};
