import { getGlobal } from '../../global';

import type {
  ApiChat, ApiMessage, ApiPeer, ApiUser,
} from '../../api/types';
import type { LangFn } from '../localization';
import { MAIN_THREAD_ID } from '../../api/types';

import { APP_NAME } from '../../config';
import { getPeerTitle } from '../../global/helpers/peers';
import { selectPeer } from '../../global/selectors';
import { callApi } from '../../api/gramjs';
import jsxToHtml from '../element/jsxToHtml';
import { pause } from '../schedulers';

import MessageSummary from '../../components/common/MessageSummary';

// "Export chat history" of Telegram Desktop, as one self-contained HTML page: text, authors, dates,
// replies and what media each message had. Media files themselves stay in Telegram.

const BATCH_SIZE = 100;
// Keeps a long export well under the flood limits
const BATCH_PAUSE_MS = 150;

export type ExportProgress = {
  loaded: number;
  total?: number;
};

type PeerTitles = Map<string, string>;

export async function loadChatHistory(
  chat: ApiChat,
  onProgress: (progress: ExportProgress) => void,
  signal: AbortSignal,
) {
  const messages: ApiMessage[] = [];
  const peers: ApiPeer[] = [];
  let offsetId: number | undefined;
  let total: number | undefined;

  while (!signal.aborted) {
    const result = await callApi('fetchMessages', {
      chat, threadId: MAIN_THREAD_ID, offsetId, limit: BATCH_SIZE,
    });
    if (!result) throw new Error('Failed to load messages');

    total ??= result.count;
    peers.push(...result.users, ...result.chats);
    // Local and scheduled messages never come from the history request, but keep the ids sane anyway
    const batch = result.messages.filter((message) => message.id > 0 && message.id !== offsetId);
    messages.push(...batch);
    onProgress({ loaded: messages.length, total });

    if (!batch.length) break;
    offsetId = Math.min(...batch.map((message) => message.id));
    await pause(BATCH_PAUSE_MS);
  }

  messages.sort((a, b) => a.id - b.id);
  return { messages, peers };
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Plain text with clickable links; formatting is left out, like in a printed transcript
function renderText(text: string) {
  return escapeHtml(text).replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g, (url) => (
    `<a href="${url}" rel="noopener noreferrer">${url}</a>`
  ));
}

function getTitle(lang: LangFn, peerTitles: PeerTitles, peerId?: string) {
  if (!peerId) return undefined;

  const cached = peerTitles.get(peerId);
  if (cached) return cached;

  const peer = selectPeer(getGlobal(), peerId);
  return peer ? getPeerTitle(lang, peer) : undefined;
}

function getMediaLabel(message: ApiMessage) {
  const { content } = message;
  if (content.action) return undefined;

  const hasMedia = Object.keys(content).some((key) => key !== 'text' && key !== 'richMessage');
  if (!hasMedia) return undefined;

  const withoutText: ApiMessage = { ...message, content: { ...content, text: undefined } };
  return jsxToHtml(<span><MessageSummary message={withoutText} noEmoji /></span>)[0].textContent || undefined;
}

function getServiceText(lang: LangFn, message: ApiMessage) {
  return jsxToHtml(<span><MessageSummary message={message} /></span>)[0].textContent
    || lang('NoirgramExportService');
}

export function buildChatHistoryHtml(
  lang: LangFn,
  chat: ApiChat,
  { messages, peers }: { messages: ApiMessage[]; peers: ApiPeer[] },
) {
  const global = getGlobal();
  const peerTitles: PeerTitles = new Map(peers.map((peer) => [peer.id, getPeerTitle(lang, peer) || '']));
  const chatTitle = getPeerTitle(lang, chat) || '';
  const currentUser: ApiUser | undefined = global.currentUserId
    ? global.users.byId[global.currentUserId]
    : undefined;
  const ownTitle = currentUser ? getPeerTitle(lang, currentUser) : undefined;

  const dayFormat = new Intl.DateTimeFormat(lang.code, { day: 'numeric', month: 'long', year: 'numeric' });
  const timeFormat = new Intl.DateTimeFormat(lang.code, { hour: '2-digit', minute: '2-digit' });
  const fullFormat = new Intl.DateTimeFormat(lang.code, { dateStyle: 'full', timeStyle: 'medium' });
  const ids = new Set(messages.map((message) => message.id));

  let lastDay: string | undefined;
  const parts = messages.map((message) => {
    const date = new Date(message.date * 1000);
    const day = dayFormat.format(date);
    const daySeparator = day !== lastDay ? `<div class="day">${escapeHtml(day)}</div>` : '';
    lastDay = day;

    if (message.content.action) {
      const serviceText = renderText(getServiceText(lang, message));
      return `${daySeparator}<div class="service" id="m${message.id}">${serviceText}</div>`;
    }

    const author = message.isOutgoing && ownTitle
      ? ownTitle
      : getTitle(lang, peerTitles, message.senderId || chat.id) || chatTitle;

    const meta = [];
    const { forwardInfo, replyInfo } = message;
    if (forwardInfo) {
      const from = forwardInfo.hiddenUserName
        || getTitle(lang, peerTitles, forwardInfo.fromId || forwardInfo.fromChatId);
      if (from) meta.push(`<div class="forward">${escapeHtml(`${lang('ForwardedFrom')} ${from}`)}</div>`);
    }
    if (replyInfo?.type === 'message' && replyInfo.replyToMsgId && !replyInfo.replyToPeerId) {
      const target = replyInfo.replyToMsgId;
      meta.push(ids.has(target)
        ? `<a class="reply" href="#m${target}">${escapeHtml(lang('NoirgramExportReply'))} #${target}</a>`
        : `<span class="reply">${escapeHtml(lang('NoirgramExportReply'))} #${target}</span>`);
    }

    const mediaLabel = getMediaLabel(message);
    const text = message.content.text?.text;

    return `${daySeparator}<article class="message${message.isOutgoing ? ' own' : ''}" id="m${message.id}">`
      + `<header><b>${escapeHtml(author)}</b>`
      + `<time datetime="${date.toISOString()}" title="${escapeHtml(fullFormat.format(date))}">`
      + `${escapeHtml(timeFormat.format(date))}</time></header>`
      + meta.join('')
      + (mediaLabel ? `<div class="media">${escapeHtml(mediaLabel)}</div>` : '')
      + (text ? `<p>${renderText(text)}</p>` : '')
      + '</article>';
  });

  const exportedAt = fullFormat.format(new Date());

  return `<!doctype html>
<html lang="${escapeHtml(lang.code)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(chatTitle)} — ${APP_NAME}</title>
<style>
:root { color-scheme: light dark; --bg: #f4f5f7; --card: #fff; --own: #e3ebfa; --ink: #16181d; --muted: #6b7280;
  --accent: #4a6db8; --line: rgba(0, 0, 0, 0.08); }
@media (prefers-color-scheme: dark) {
  :root { --bg: #0b0c10; --card: #1a1c24; --own: #2b3a5c; --ink: #eceef2; --muted: #9aa0ab;
    --accent: #87a6df; --line: rgba(255, 255, 255, 0.08); }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink);
  font: 15px/1.5 "Inter Variable", "Inter", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 32px 16px 64px; }
h1 { margin: 0 0 4px; font-size: 28px; letter-spacing: -0.02em; }
.summary { margin: 0 0 24px; color: var(--muted); font-size: 13px; }
.day { position: sticky; top: 8px; z-index: 1; width: fit-content; margin: 20px auto 10px; padding: 2px 12px;
  border-radius: 999px; background: var(--card); color: var(--muted); font-size: 13px;
  box-shadow: 0 0 0 1px var(--line); }
.message { margin: 6px 0; padding: 8px 12px; border-radius: 14px; background: var(--card);
  box-shadow: 0 0 0 1px var(--line); }
.message.own { background: var(--own); }
.message:target, .service:target { outline: 2px solid var(--accent); }
header { display: flex; gap: 8px; align-items: baseline; }
header b { font-weight: 600; color: var(--accent); }
time { margin-left: auto; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
p { margin: 2px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.media, .forward, .reply { display: block; margin-top: 2px; color: var(--muted); font-size: 13px; }
.media::before { content: "▣ "; }
a { color: var(--accent); }
.service { margin: 10px auto; width: fit-content; max-width: 90%; color: var(--muted); font-size: 13px;
  text-align: center; }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(chatTitle)}</h1>
<p class="summary">${escapeHtml(lang('NoirgramExportSummary', { count: messages.length, date: exportedAt }))}</p>
${parts.join('\n')}
</main>
</body>
</html>
`;
}

export function getExportFilename(lang: LangFn, chat: ApiChat) {
  // Windows file names: no reserved or control characters
  const title = Array.from(getPeerTitle(lang, chat) || 'chat')
    .map((char) => (char < ' ' || '<>:"/\\|?*'.includes(char) ? '_' : char))
    .join('')
    .trim()
    .slice(0, 80);
  const date = new Date().toISOString().slice(0, 10);
  return `${title} ${date}.html`;
}
