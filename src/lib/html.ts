// Helpers for client scripts that build markup with innerHTML from TeamLinkt
// data. Team names and links come from the API (and stripHtml() decodes
// entities), so anything API-derived must pass through here before it lands
// in a template string.

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape a value for use in HTML text or a quoted attribute. */
export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** Return the URL if it is http(s) (relative URLs resolve against this page), else '#'. */
export function safeUrl(u: unknown): string {
  if (typeof u !== 'string' || u.trim() === '') return '#';
  try {
    const parsed = new URL(u, location.origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? u : '#';
  } catch {
    return '#';
  }
}
