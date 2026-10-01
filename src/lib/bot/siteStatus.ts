// The site-wide banner ("Thursday games are canceled tonight"). Set by an
// admin in the private GroupMe control group, stored in KV, read by
// SiteStatusBanner on every page.
// Every status expires at 4 AM Eastern the next morning, so nothing lingers.

import { etNowString } from '../seasonConfig';

export type SiteStatusKind = 'rainout' | 'games-on';

export interface SiteStatus {
  kind: SiteStatusKind;
  message: string;
  day: string; // 'Thu'
  setAt: string; // ISO
}

export const STATUS_KEY = 'site-status';

/** Seconds from `now` until 4:00 AM Eastern (tomorrow's, or today's if it's still before 4). */
export function secondsUntilEtFourAm(now: Date = new Date()): number {
  const [, time] = etNowString(now).split(' ');
  const [h, m, s] = time.split(':').map(Number);
  const elapsed = h * 3600 + m * 60 + s;
  const target = 4 * 3600;
  const secs = elapsed < target ? target - elapsed : 24 * 3600 - elapsed + target;
  // KV needs at least 60s; a DST night is off by an hour at most, which is fine here.
  return Math.max(60, secs);
}
