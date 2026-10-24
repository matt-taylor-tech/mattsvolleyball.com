import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { BASELINE_DIR, META_FILE } from './paths.mjs';

// A baseline run starts from an empty folder and stamps the time every page
// is frozen at, in that run and in the compare runs after it.
export default function globalSetup(config) {
  if (config.updateSnapshots !== 'all') return;
  rmSync(BASELINE_DIR, { recursive: true, force: true });
  mkdirSync(BASELINE_DIR, { recursive: true });
  writeFileSync(META_FILE, JSON.stringify({ time: Date.now() }));
}
