// Links that subscribe a phone's calendar to a team's live feed
// (functions/calendar/[team].ts). A subscription is re-fetched by the calendar
// app, so schedule changes show up on their own.
//
// - iPhone/iPad/Mac: webcal:// opens the native "Subscribe" prompt.
// - Android: Google Calendar is the native calendar, and its ?cid= link opens
//   the "Add calendar" prompt for a webcal feed.
// - Anything else: offer both, plus the plain https URL to copy.

export type CalendarPlatform = 'apple' | 'android' | 'other';

export function detectCalendarPlatform(ua: string = navigator.userAgent): CalendarPlatform {
  if (/android/i.test(ua)) return 'android';
  // iPadOS reports itself as Macintosh; both use Apple Calendar natively.
  if (/iphone|ipad|ipod|macintosh/i.test(ua)) return 'apple';
  return 'other';
}

export function teamCalendarUrls(teamId: number, origin: string = location.origin) {
  const https = `${origin}/calendar/${teamId}.ics`;
  const webcal = https.replace(/^https?:/, 'webcal:');
  return {
    https,
    webcal,
    google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`,
  };
}

/**
 * Fill `el` with the platform's native "add to calendar" button plus a
 * fallback (the other calendar, or copying the feed link).
 * `tone` picks button colors for light or dark backgrounds.
 */
export function renderCalendarActions(el: HTMLElement, teamId: number, tone: 'light' | 'dark' = 'light'): void {
  const urls = teamCalendarUrls(teamId);
  const platform = detectCalendarPlatform();
  const primary = platform === 'apple'
    ? { href: urls.webcal, label: 'Add games to my calendar', external: false }
    : { href: urls.google, label: platform === 'android' ? 'Add games to my calendar' : 'Add to Google Calendar', external: true };
  const alt = platform === 'apple'
    ? { href: urls.google, label: 'Use Google Calendar', external: true }
    : platform === 'other'
      ? { href: urls.webcal, label: 'Apple Calendar / Outlook', external: false }
      : null;
  const muted = tone === 'dark' ? 'text-white/70' : 'text-ocean-600/70';
  const link = tone === 'dark' ? 'text-white underline hover:text-white/80' : 'text-ocean-700 underline hover:text-ocean-500';
  const ext = (external: boolean) => (external ? ' target="_blank" rel="noopener noreferrer"' : '');

  el.innerHTML = `
    <a href="${primary.href}"${ext(primary.external)} class="btn-primary !text-base !py-3 !px-6 inline-flex items-center justify-center gap-2 w-full sm:w-auto">
      <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke-width="2"/>
        <line x1="16" y1="2" x2="16" y2="6" stroke-width="2"/><line x1="8" y1="2" x2="8" y2="6" stroke-width="2"/>
        <line x1="3" y1="10" x2="21" y2="10" stroke-width="2"/>
      </svg>
      ${primary.label}
    </a>
    <p class="mt-2 text-xs ${muted}">
      Updates on its own when the schedule changes.
      ${alt ? `<a href="${alt.href}"${ext(alt.external)} class="${link}">${alt.label}</a> ·` : ''}
      <button type="button" data-cal-copy class="${link}">Copy link</button>
    </p>`;

  const copyBtn = el.querySelector<HTMLButtonElement>('[data-cal-copy]');
  copyBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(urls.https);
      copyBtn.textContent = 'Link copied';
    } catch {
      window.prompt('Copy this calendar link:', urls.https);
    }
  });
}
