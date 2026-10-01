/**
 * GroupMe bot callback: POST /api/groupme/<GROUPME_CALLBACK_SECRET>
 *
 * GroupMe posts every message in the bot's group here (main chat only: bots
 * can't see topics). GroupMe doesn't sign callbacks, so the secret in the path
 * is what keeps others from calling it; only the bot's owner can see the URL.
 *
 * - Anyone: !schedule, !standings, !spots, !help (the bot replies).
 * - Admins (GROUPME_ADMIN_USER_IDS): RAINOUT / GAMES ON / CLEAR set the site
 *   banner and repost the call into that night's topic as Matt.
 * - Messages from the Bot Test Group use the test bot and a separate banner
 *   key, so rehearsals never touch the live site or the real topics.
 *
 * Env (Pages project settings, as secrets):
 *   MV_STATE                 KV namespace binding
 *   GROUPME_CALLBACK_SECRET  the path segment above
 *   GROUPME_ADMIN_USER_IDS   comma-separated GroupMe user ids allowed to set the banner
 *   GROUPME_BOT_ID           bot in the main group
 *   GROUPME_BOT_ID_TEST      bot in the Bot Test Group
 *   GROUPME_TOKEN            Matt's access token, for reposting into topics
 *   GROUPME_DRY_RUN          '1' to log posts instead of sending (local testing)
 */

import { parseCommand, replyFor, statusWording, etToday } from '../../../src/lib/bot/commands';
import { postAsBot, postAsUser, MAIN_GROUP_ID, TEST_GROUP_ID, NIGHT_CONVERSATION_IDS } from '../../../src/lib/bot/groupme';
import { STATUS_KEY, TEST_STATUS_KEY, secondsUntilEtFourAm, type SiteStatus } from '../../../src/lib/bot/siteStatus';

interface KV {
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

interface Env {
  MV_STATE?: KV;
  GROUPME_CALLBACK_SECRET?: string;
  GROUPME_ADMIN_USER_IDS?: string;
  GROUPME_BOT_ID?: string;
  GROUPME_BOT_ID_TEST?: string;
  GROUPME_TOKEN?: string;
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
  const isTest = msg.group_id === TEST_GROUP_ID;
  const botId = isTest ? env.GROUPME_BOT_ID_TEST : env.GROUPME_BOT_ID;
  if (!botId) return;
  const dryRun = env.GROUPME_DRY_RUN === '1';
  const reply = (text: string) => postAsBot(botId, text, { dryRun });

  const admins = (env.GROUPME_ADMIN_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const isAdmin = !!msg.user_id && admins.includes(msg.user_id);
  const cmd = parseCommand(msg.text ?? '', isAdmin);
  if (!cmd) return;

  try {
    if (cmd.type === 'status' || cmd.type === 'clear') {
      if (!env.MV_STATE) {
        await reply('⚠️ Banner storage (MV_STATE) isn\'t set up, so nothing changed.');
        return;
      }
      const key = isTest ? TEST_STATUS_KEY : STATUS_KEY;

      if (cmd.type === 'clear') {
        await env.MV_STATE.delete(key);
        await reply(`🧹 Site banner cleared${isTest ? ' (test)' : ''}.`);
        return;
      }

      const day = cmd.day ?? etToday();
      const { banner, repost } = statusWording(cmd.kind, cmd.message, day);
      const status: SiteStatus = { kind: cmd.kind, message: banner, day, setAt: new Date().toISOString() };
      await env.MV_STATE.put(key, JSON.stringify(status), { expirationTtl: secondsUntilEtFourAm() });

      // Repost where that night's players look: the night's topic, or the
      // test group itself when rehearsing.
      const target = isTest ? TEST_GROUP_ID : NIGHT_CONVERSATION_IDS[day];
      let reposted = '';
      if (target && env.GROUPME_TOKEN) {
        await postAsUser(env.GROUPME_TOKEN, target, repost, { dryRun });
        reposted = isTest ? ' Reposted here (test).' : ` Posted in the ${day} chat.`;
      }
      await reply(`✅ Banner is up on mattsvolleyball.com${isTest ? ' (test)' : ''} until 4 AM.${reposted}`);
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

  // Never answer bots (including ourselves) or system notices, and only
  // act in the groups this bot serves.
  if (msg.sender_type === 'user' && (msg.group_id === MAIN_GROUP_ID || msg.group_id === TEST_GROUP_ID)) {
    // Answer GroupMe right away; the work (TeamLinkt fetches, replies) continues in the background.
    waitUntil(handle(msg, env));
  }
  return new Response('ok');
};
