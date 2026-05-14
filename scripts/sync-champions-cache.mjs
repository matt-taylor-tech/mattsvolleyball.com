/**
 * Lists every champion in R2 and writes a JSON snapshot to
 * src/data/champions.fallback.json. The site reads that file when R2 is
 * unavailable or returns 0 results at build time, so committing this file
 * after photo uploads keeps the Champions page populated through R2 hiccups.
 *
 * Usage:
 *   node scripts/sync-champions-cache.mjs
 *
 * Requires .env with R2 credentials (same vars as upload-champions.mjs).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const OUTPUT_PATH = 'src/data/champions.fallback.json';
const BUCKET_PREFIX = 'mattsvolleyball/images/champions/';

const SEASON_ORDER = { spring: 1, 'summer-i': 2, 'summer-ii': 3, fall: 4, winter: 5 };
const SEASON_DISPLAY = { spring: 'Spring', 'summer-i': 'Summer I', 'summer-ii': 'Summer II', fall: 'Fall', winter: 'Winter' };

function titleCase(slug) {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .replace(/\+(\w)/g, (_, c) => '+' + c.toUpperCase());
}

function parseChampionKey(key) {
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

// Load .env manually (matches upload-champions.mjs pattern)
const envFile = readFileSync('.env', 'utf-8');
const env = {};
for (const line of envFile.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const accountId = (env.R2_ACCOUNT_ID ?? '').trim();
const accessKeyId = (env.R2_ACCESS_KEY_ID ?? '').trim();
const secretAccessKey = (env.R2_SECRET_ACCESS_KEY ?? '').trim();
const bucket = (env.R2_BUCKET_NAME ?? '').trim();

if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
  console.error('Missing R2 credentials in .env (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME).');
  process.exit(1);
}

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

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

champions.sort((a, b) => {
  if (a.year !== b.year) return b.year - a.year;
  return b._seasonOrder - a._seasonOrder;
});

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, JSON.stringify(champions, null, 2) + '\n');
console.log(`Wrote ${champions.length} champions to ${OUTPUT_PATH}.`);
console.log('Commit this file so the site can survive R2 hiccups at build time.');
