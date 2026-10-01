/**
 * GroupMe bot callback: POST /api/groupme/<GROUPME_CALLBACK_SECRET>
 *
 * GroupMe posts every message in a bot's group here (the main chat only: bots
 * can't see topics). GroupMe doesn't sign callbacks, so the secret in the path
 * is what keeps others from calling it; only the bot's owner can see the URL.
 *
 * - Main chat and control group, anyone: !schedule, !standings, !spots, !help.
 * - Control group (the private Bot Test Group), admins only: RAINOUT /
 *   GAMES ON / CLEAR set the site banner, STATUS shows it, and HELP lists
 *   these alongside the public commands. Nothing is posted to players: the
 *   person who makes the call announces it in the night's topic as usual.
 *
 * Env (Pages project settings, as secrets):
 *   MV_STATE                 KV namespace binding
 *   GROUPME_CALLBACK_SECRET  the path segment above
 *   GROUPME_ADMIN_USER_IDS   comma-separated GroupMe user ids allowed to set the banner
 *   GROUPME_BOT_ID           bot in the main group
 *   GROUPME_BOT_ID_TEST      bot in the control group
 *   GROUPME_DRY_RUN          '1' to log replies instead of sending (local testing)
 */

import { parseCommand, replyFor, statusWording, etToday } from '../../../src/lib/bot/commands';
import { postAsBot, MAIN_GROUP_ID, CONTROL_GROUP_ID } from '../../../src/lib/bot/groupme';
import { STATUS_KEY, secondsUntilEtFourAm, type SiteStatus } from '../../../src/lib/bot/siteStatus';

interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

interface Env {
  MV_STATE?: KV;
  GROUPME_CALLBACK_SECRET?: string;
  GROUPME_ADMIN_USER_IDS?: string;
  GROUPME_BOT_ID?: string;
  GROUPME_BOT_ID_TEST?: string;
  GROUPME_DRY_RUN?: string;
}

interface GroupMeMessage {
  group_id?: string;
  user_id?: string;
  sender_type?: string; // 'user' | 'bot' | 'system'
  text?: string | null;
}

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function handle(msg: GroupMeMessage, env: Env): Promise<void> {
  const inControlGroup = msg.group_id === CONTROL_GROUP_ID;
  const botId = inControlGroup ? env.GROUPME_BOT_ID_TEST : env.GROUPME_BOT_ID;
  if (!botId) return;
  const reply = (text: string) => postAsBot(botId, text, { dryRun: env.GROUPME_DRY_RUN === '1' });

  // Banner commands only count in the private control group, so nothing said
  // in the main chat can change the site.
  const admins = (env.GROUPME_ADMIN_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const canSetBanner = inControlGroup && !!msg.user_id && admins.includes(msg.user_id);
  const cmd = parseCommand(msg.text ?? '', canSetBanner);
  if (!cmd) return;

  try {
    if (cmd.type === 'show-status' || cmd.type === 'status' || cmd.type === 'clear') {
      if (!env.MV_STATE) {
        await reply('⚠️ Banner storage (MV_STATE) isn\'t set up, so nothing changed.');
        return;
      }
      if (cmd.type === 'show-status') {
        const raw = await env.MV_STATE.get(STATUS_KEY);
        const current: SiteStatus | null = raw ? JSON.parse(raw) : null;
        await reply(current
          ? `The site shows: ${current.kind === 'rainout' ? '🌧️ RAINOUT' : '✅ GAMES ON'}: "${current.message}" (until 4 AM, CLEAR removes it)`
          : 'No banner on the site right now.');
        return;
      }
      if (cmd.type === 'clear') {
        await env.MV_STATE.delete(STATUS_KEY);
        await reply('🧹 Site banner cleared.');
        return;
      }
      const day = cmd.day ?? etToday();
      const { banner } = statusWording(cmd.kind, cmd.message, day);
      const status: SiteStatus = { kind: cmd.kind, message: banner, day, setAt: new Date().toISOString() };
      await env.MV_STATE.put(STATUS_KEY, JSON.stringify(status), { expirationTtl: secondsUntilEtFourAm() });
      await reply(`✅ Banner is up on mattsvolleyball.com until 4 AM: "${banner}" (CLEAR removes it)`);
      return;
    }

    for (const text of await replyFor(cmd)) await reply(text);
  } catch (error) {
    console.error('GroupMe command failed:', error);
    await reply("Couldn't reach TeamLinkt right now. Try again in a minute.").catch(() => {});
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ params, request, env, waitUntil }) => {
  const expected = env.GROUPME_CALLBACK_SECRET;
  if (!expected || !sameSecret(String(params.secret ?? ''), expected)) {
    return new Response('Not found', { status: 404 });
  }

  let msg: GroupMeMessage;
  try {
    msg = await request.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  // Never answer bots (including ourselves) or system notices, and only act
  // in the groups this bot serves.
  if (msg.sender_type === 'user' && (msg.group_id === MAIN_GROUP_ID || msg.group_id === CONTROL_GROUP_ID)) {
    // Answer GroupMe right away; the work (TeamLinkt fetches, replies) continues in the background.
    waitUntil(handle(msg, env));
  }
  return new Response('ok');
};
