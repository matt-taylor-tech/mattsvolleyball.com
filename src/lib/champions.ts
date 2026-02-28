import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

export interface Champion {
  teamName: string;
  season: string;
  year: number;
  day: string;
  division: string;
  photo: string;
  /** Used internally for sorting */
  _seasonOrder: number;
}

const SEASON_ORDER: Record<string, number> = {
  spring: 1,
  'summer-i': 2,
  'summer-ii': 3,
  fall: 4,
  winter: 5,
};

const SEASON_DISPLAY: Record<string, string> = {
  spring: 'Spring',
  'summer-i': 'Summer I',
  'summer-ii': 'Summer II',
  fall: 'Fall',
  winter: 'Winter',
};

function titleCase(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .replace(/\+(\w)/g, (_, c) => '+' + c.toUpperCase());
}

/** Prefix in the R2 bucket where the site's files live */
const BUCKET_PREFIX = 'mattsvolleyball/images/champions/';

function parseChampionKey(key: string): Champion | null {
  // Expected: mattsvolleyball/images/champions/{year}/{season}_{day}_{division}_{team-name}.ext
  if (!key.startsWith(BUCKET_PREFIX)) return null;
  const relative = key.slice(BUCKET_PREFIX.length);

  const pathMatch = relative.match(
    /^(\d{4})\/(.+)\.(jpe?g|png|webp|avif)$/i
  );
  if (!pathMatch) return null;

  const year = parseInt(pathMatch[1], 10);
  const basename = pathMatch[2];
  const parts = basename.split('_');
  if (parts.length < 4) return null;

  const seasonKey = parts[0].toLowerCase();
  if (!SEASON_DISPLAY[seasonKey]) return null;

  const day = parts[1];
  const division = parts[2];
  // Everything after the 3rd underscore is the team name (hyphens become spaces)
  const teamSlug = parts.slice(3).join('-');

  // Photo path relative to PUBLIC_R2_BASE_URL
  return {
    year,
    season: SEASON_DISPLAY[seasonKey],
    day: titleCase(day),
    division: titleCase(division),
    teamName: titleCase(teamSlug),
    photo: `/images/champions/${relative}`,
    _seasonOrder: SEASON_ORDER[seasonKey],
  };
}

export async function getChampions(): Promise<Champion[]> {
  // Trim env vars to strip hidden chars (Cloudflare Pages can inject \r, BOM, etc.)
  const accountId = (import.meta.env.R2_ACCOUNT_ID ?? '').trim();
  const accessKeyId = (import.meta.env.R2_ACCESS_KEY_ID ?? '').trim();
  const secretAccessKey = (import.meta.env.R2_SECRET_ACCESS_KEY ?? '').trim();
  const bucket = (import.meta.env.R2_BUCKET_NAME ?? '').trim();

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    console.warn('[champions] R2 credentials not configured, skipping.');
    return [];
  }

  let client: S3Client;
  try {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  } catch (err) {
    console.error('[champions] Failed to create S3 client:', err);
    return [];
  }

  const champions: Champion[] = [];
  let continuationToken: string | undefined;

  try {
    do {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: BUCKET_PREFIX,
        ContinuationToken: continuationToken,
      });

      const response = await client.send(command);

      for (const obj of response.Contents ?? []) {
        if (!obj.Key) continue;
        const champ = parseChampionKey(obj.Key);
        if (champ) champions.push(champ);
      }

      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined;
    } while (continuationToken);
  } catch (err) {
    console.error('[champions] R2 listing failed:', err);
    return [];
  }

  // Sort newest first: year desc, then season order desc
  champions.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b._seasonOrder - a._seasonOrder;
  });

  return champions;
}
