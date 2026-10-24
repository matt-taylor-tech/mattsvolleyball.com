import { TEAMLINKT_API_BASE } from './seasonConfig';

// Browser pages call TeamLinkt through the caching proxy in
// functions/api/teamlinkt (issue #46), so visitors share one cached copy
// instead of each hitting TeamLinkt. `astro dev` doesn't run Functions, so
// there the request goes straight to TeamLinkt. The `?.` is for Pages
// Functions, which load this module (via teamCounts) without import.meta.env.
const BROWSER_API_BASE = import.meta.env?.DEV ? TEAMLINKT_API_BASE : '/api/teamlinkt';

/** fetch() for a TeamLinkt API URL from browser code. Server code uses fetch() directly. */
export function teamlinktFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url.replace(TEAMLINKT_API_BASE, BROWSER_API_BASE), init);
}
