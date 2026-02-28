/**
 * Reads champion-mapping.csv, resizes/compresses images, and uploads to R2.
 *
 * Usage:
 *   node scripts/upload-champions.mjs [--dry-run]
 *
 * Requires .env with R2 credentials and sharp installed.
 */

import { readFileSync } from 'fs';
import { extname, join } from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

// ---------- Config ----------
const SOURCE_DIR = 'G:/My Drive/MattsVolleyball/pictures/Champions';
const CSV_PATH = 'champion-mapping.csv';
const R2_PREFIX = 'mattsvolleyball/images/champions';
const MAX_WIDTH = 1200;
const JPEG_QUALITY = 80;

// Load .env manually (no extra deps)
const envFile = readFileSync('.env', 'utf-8');
const env = {};
for (const line of envFile.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const dryRun = process.argv.includes('--dry-run');

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

// ---------- Parse CSV ----------
const csv = readFileSync(CSV_PATH, 'utf-8');
const lines = csv.trim().split('\n').slice(1); // skip header

const entries = lines.map((line) => {
  const [original, year, season, day, division, team_name, action] =
    line.split(',').map((s) => s.trim());
  return { original, year, season, day, division, team_name, action };
});

// ---------- Build upload plan ----------
const plan = [];
const keysSeen = new Map();

for (const e of entries) {
  if (e.action !== 'rename') continue;

  // Always output as .jpg since we convert to JPEG
  const newName = `${e.season}_${e.day}_${e.division}_${e.team_name}.jpg`;
  const r2Key = `${R2_PREFIX}/${e.year}/${newName}`;
  const srcPath = join(SOURCE_DIR, e.original);

  if (keysSeen.has(r2Key)) {
    console.warn(
      `  ⚠ DUPLICATE KEY: ${r2Key}\n    Previous: ${keysSeen.get(r2Key)}\n    Current:  ${e.original} (will overwrite)\n`
    );
  }
  keysSeen.set(r2Key, e.original);

  plan.push({ srcPath, r2Key, original: e.original });
}

console.log(`\nUpload plan: ${plan.length} files\n`);

// ---------- Upload ----------
let success = 0;
let errors = 0;
let totalOriginal = 0;
let totalCompressed = 0;

for (const { srcPath, r2Key, original } of plan) {
  const shortKey = r2Key.replace(R2_PREFIX + '/', '');

  if (dryRun) {
    try {
      const raw = readFileSync(srcPath);
      const meta = await sharp(raw).metadata();
      const sizeMB = (raw.length / 1024 / 1024).toFixed(1);
      console.log(`[DRY RUN] ${original} (${meta.width}x${meta.height}, ${sizeMB}MB) → ${shortKey}`);
    } catch {
      console.log(`[DRY RUN] ${original} → ${shortKey}`);
    }
    continue;
  }

  try {
    const raw = readFileSync(srcPath);
    const originalSize = raw.length;

    // Resize to max width, convert to JPEG, strip metadata
    const compressed = await sharp(raw)
      .rotate() // auto-rotate based on EXIF orientation
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();

    const compressedSize = compressed.length;
    totalOriginal += originalSize;
    totalCompressed += compressedSize;

    const savings = (((originalSize - compressedSize) / originalSize) * 100).toFixed(0);

    await client.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: r2Key,
        Body: compressed,
        ContentType: 'image/jpeg',
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );

    console.log(
      `✓ ${original} → ${shortKey} (${(compressedSize / 1024).toFixed(0)}KB, -${savings}%)`
    );
    success++;
  } catch (err) {
    console.error(`✗ ${original} → ${err.message}`);
    errors++;
  }
}

if (!dryRun && success > 0) {
  const totalSavings = (((totalOriginal - totalCompressed) / totalOriginal) * 100).toFixed(0);
  console.log(
    `\nDone: ${success} uploaded, ${errors} errors.` +
    `\nTotal: ${(totalOriginal / 1024 / 1024).toFixed(1)}MB → ${(totalCompressed / 1024 / 1024).toFixed(1)}MB (-${totalSavings}%)`
  );
}
