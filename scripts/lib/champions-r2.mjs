// Shared helpers for champion photos in R2.
// Used by sync-champions-cache.mjs and champion-wizard.mjs.
//
// Object keys follow the naming the site parses in src/lib/champions.ts:
//   mattsvolleyball/images/champions/{year}/{season}_{day}_{division}_{team-name}.jpg

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  S3Client, ListObjectsV2Command, PutObjectCommand, HeadObjectCommand,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const FALLBACK_PATH = path.join(REPO_ROOT, 'src/data/champions.fallback.json');

export const BUCKET_PREFIX = 'mattsvolleyball/images/champions/';
export const PHOTO_SIZE = 1200; // square; cards render at 600x600
const JPEG_QUALITY = 80;

export const SEASON_ORDER = { spring: 1, 'summer-i': 2, 'summer-ii': 3, fall: 4, winter: 5 };
export const SEASON_DISPLAY = { spring: 'Spring', 'summer-i': 'Summer I', 'summer-ii': 'Summer II', fall: 'Fall', winter: 'Winter' };

function titleCase(slug) {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .replace(/\+(\w)/g, (_, c) => '+' + c.toUpperCase());
}

export function parseChampionKey(key) {
  if (!key.startsWith(BUCKET_PREFIX)) return null;
  const relative = key.slice(BUCKET_PREFIX.length);
  const pathMatch = relative.match(/^(\d{4})\/(.+)\.(jpe?g|png|webp|avif)$/i);
  if (!pathMatch) return null;
  const year = parseInt(pathMatch[1], 10);
  const basename = pathMatch[2];
  const parts = basename.split('_');
  if (parts.length < 4) return null;
  const seasonKey = parts[0].toLowerCase();
  if (!SEASON_DISPLAY[seasonKey]) return null;
  const day = parts[1];
  const division = parts[2];
  const teamSlug = parts.slice(3).join('-');
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

/** Lowercase, hyphen-separated slug. Keeps "+" (e.g. "j+l"), drops other punctuation. */
export function slugify(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9+]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** R2 key for a champion photo, or throws if a field is missing or invalid. */
export function buildKey({ year, season, day, division, team }) {
  const y = String(year ?? '').trim();
  if (!/^\d{4}$/.test(y)) throw new Error('Year must be four digits.');
  if (!SEASON_DISPLAY[season]) throw new Error(`Unknown season "${season}".`);
  const parts = { day: slugify(day), division: slugify(division), team: slugify(team) };
  for (const [name, value] of Object.entries(parts)) {
    if (!value) throw new Error(`Missing ${name}.`);
  }
  // Underscores separate fields, so none of the slugs may contain one (slugify guarantees it).
  return `${BUCKET_PREFIX}${y}/${season}_${parts.day}_${parts.division}_${parts.team}.jpg`;
}

// ── Environment + client ─────────────────────────────────────────────────────

/** Reads .env from the repo root (no extra deps). */
export function loadEnv() {
  const env = {};
  let text = '';
  try {
    text = readFileSync(path.join(REPO_ROOT, '.env'), 'utf-8');
  } catch {
    return env;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
  }
  return env;
}

/** { client, bucket, env }, or exits with a clear message when credentials are missing. */
export function createR2() {
  const env = loadEnv();
  const accountId = env.R2_ACCOUNT_ID ?? '';
  const accessKeyId = env.R2_ACCESS_KEY_ID ?? '';
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY ?? '';
  const bucket = env.R2_BUCKET_NAME ?? '';

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    console.error('Missing R2 credentials in .env (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME).');
    process.exit(1);
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return { client, bucket, env };
}

// ── R2 operations ────────────────────────────────────────────────────────────

/** Every champion in R2, newest first. */
export async function listChampions({ client, bucket }) {
  const champions = [];
  let continuationToken;
  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: BUCKET_PREFIX,
        ContinuationToken: continuationToken,
      })
    );
    for (const obj of response.Contents ?? []) {
      if (!obj.Key) continue;
      const champ = parseChampionKey(obj.Key);
      if (champ) champions.push(champ);
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return champions.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b._seasonOrder - a._seasonOrder;
  });
}

/** Writes the committed snapshot the site falls back to when R2 is unavailable. */
export function writeFallback(champions) {
  mkdirSync(path.dirname(FALLBACK_PATH), { recursive: true });
  writeFileSync(FALLBACK_PATH, JSON.stringify(champions, null, 2) + '\n');
}

export async function objectExists({ client, bucket }, key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') return false;
    throw err;
  }
}

export async function uploadChampion({ client, bucket }, key, body) {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );
}

// ── Image processing ─────────────────────────────────────────────────────────

/**
 * Square-crops and compresses a photo. `crop` is {left, top, size} in pixels
 * of the upright image (EXIF orientation applied, as the browser shows it).
 * Without a crop, takes the largest centered square. Metadata is stripped.
 */
export async function processImage(input, crop) {
  // Rotate in its own pass so the crop coordinates refer to the upright image.
  const { data, info } = await sharp(input).rotate().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  let size = Math.round(crop?.size ?? Math.min(width, height));
  size = Math.max(1, Math.min(size, width, height));
  const defaultLeft = (width - size) / 2;
  const defaultTop = (height - size) / 2;
  const left = Math.round(Math.min(Math.max(crop?.left ?? defaultLeft, 0), width - size));
  const top = Math.round(Math.min(Math.max(crop?.top ?? defaultTop, 0), height - size));

  return sharp(data)
    .extract({ left, top, width: size, height: size })
    .resize(PHOTO_SIZE, PHOTO_SIZE, { withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}
