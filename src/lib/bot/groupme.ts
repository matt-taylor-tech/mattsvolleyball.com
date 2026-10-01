// GroupMe ids and posting for the bot callback (functions/api/groupme/[secret].ts).
// The ids mirror scripts/lib/mv.mjs, which runs under Node and can't be
// imported here; change both together.

export const MAIN_GROUP_ID = '115950918';
/** The private "Bot Test Group", which doubles as the control group for the site banner. */
export const CONTROL_GROUP_ID = '115965602';

export const MAX_MESSAGE_CHARS = 950; // GroupMe's hard limit is 1000

export interface PostOptions {
  /** Log instead of posting (local testing). */
  dryRun?: boolean;
}

async function send(url: string, body: unknown, headers: Record<string, string> = {}): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GroupMe post failed: HTTP ${res.status} ${await res.text()}`);
}

/** Reply in the group the bot lives in. */
export async function postAsBot(botId: string, text: string, opts: PostOptions = {}): Promise<void> {
  if (opts.dryRun) {
    console.log(`[dry-run] bot ${botId}: ${text}`);
    return;
  }
  await send('https://api.groupme.com/v3/bots/post', { bot_id: botId, text });
}

/** Greedy-pack sections into messages under the length limit (mirrors packMessages in mv.mjs). */
export function packMessages(sections: string[], max = MAX_MESSAGE_CHARS): string[] {
  const messages: string[] = [];
  let current = '';
  for (const section of sections) {
    const candidate = current ? `${current}\n\n${section}` : section;
    if (candidate.length > max && current) {
      messages.push(current);
      current = section;
    } else {
      current = candidate;
    }
  }
  if (current) messages.push(current);
  return messages;
}
