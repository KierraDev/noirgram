import { getActions, getGlobal } from '../../global';

import type { TauriNativeNotification, TauriNotificationAction } from '../../types/tauri';

import {
  selectChat,
  selectChatLastMessageId,
  selectChatMessage,
  selectSendAs,
} from '../../global/selectors';
import { isUserId } from '../entities/ids';

// Windows toasts with an inline reply box and "Mark as read", handled by the desktop shell
// (`tauri/src/notifications.rs`). Clicks come back as `notification-action` events.

let isSupportedPromise: Promise<boolean> | undefined;
let isListening = false;
// Avatars are cached on disk by the shell, their bytes are only sent once per run
const sentIconKeys = new Set<string>();
// Newest message shown per chat: its toasts go away once the chat is read up to it
const notifiedMaxIdByChatId = new Map<string, number>();

export function checkIfNativeNotificationsSupported() {
  isSupportedPromise ??= window.tauri.isNativeNotificationsSupported().catch(() => false);
  return isSupportedPromise;
}

function getIconKey(avatarHash: string) {
  return `${avatarHash.replace(/[^a-z0-9_-]/gi, '_').slice(0, 80)}.jpg`;
}

async function fetchIcon(url: string) {
  try {
    const response = await fetch(url);
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return undefined;
  }
}

export async function showNativeNotification(
  notification: Omit<TauriNativeNotification, 'iconKey'>,
  avatar?: { hash: string; url: string },
) {
  listenToActions();

  const iconKey = avatar ? getIconKey(avatar.hash) : undefined;
  let icon: Uint8Array | undefined;
  if (avatar && iconKey && !sentIconKeys.has(iconKey)) {
    icon = await fetchIcon(avatar.url);
    if (icon) sentIconKeys.add(iconKey);
  }

  if (notification.messageId) {
    const maxId = notifiedMaxIdByChatId.get(notification.chatId) || 0;
    notifiedMaxIdByChatId.set(notification.chatId, Math.max(maxId, notification.messageId));
  }

  await window.tauri.showNativeNotification({ ...notification, iconKey }, icon);
}

export function closeNativeNotificationsIfRead(chatId: string, lastReadInboxMessageId?: number) {
  const maxId = notifiedMaxIdByChatId.get(chatId);
  if (maxId === undefined || lastReadInboxMessageId === undefined || lastReadInboxMessageId < maxId) return;

  notifiedMaxIdByChatId.delete(chatId);
  void window.tauri.closeNativeNotifications(chatId).catch(() => undefined);
}

function listenToActions() {
  if (isListening) return;
  isListening = true;

  void import('@tauri-apps/api/event').then(({ listen }) => (
    listen<TauriNotificationAction>('notification-action', ({ payload }) => handleAction(payload))
  ));
}

function handleAction({
  action, chatId, messageId, text,
}: TauriNotificationAction) {
  const { focusMessage, openChat, markChatMessagesRead } = getActions();

  switch (action) {
    case 'open':
      if (messageId) {
        focusMessage({ chatId, messageId, shouldReplaceHistory: true });
      } else {
        openChat({ id: chatId, shouldReplaceHistory: true });
      }
      window.focus();
      break;

    case 'read':
      markChatMessagesRead({ id: chatId });
      notifiedMaxIdByChatId.delete(chatId);
      void window.tauri.closeNativeNotifications(chatId).catch(() => undefined);
      break;

    case 'reply':
      if (text && sendReply(chatId, text, messageId)) {
        // Answering means having read the chat, like in Telegram Desktop
        markChatMessagesRead({ id: chatId });
        notifiedMaxIdByChatId.delete(chatId);
        void window.tauri.closeNativeNotifications(chatId).catch(() => undefined);
      } else if (messageId) {
        focusMessage({ chatId, messageId, shouldReplaceHistory: true });
        window.focus();
      }
      break;
  }
}

// Sent straight to the chat, bypassing the composer: its draft and reply state stay untouched.
// In groups the answer quotes the message, so it is clear what it answers (and lands in its topic).
function sendReply(chatId: string, text: string, messageId?: number) {
  const global = getGlobal();
  const chat = selectChat(global, chatId);
  if (!chat) return false;

  const replyMessage = messageId ? selectChatMessage(global, chatId, messageId) : undefined;
  const shouldQuote = Boolean(replyMessage) && !isUserId(chatId);

  getActions().sendMessages({
    sendParams: [{
      chat,
      text,
      replyInfo: shouldQuote ? { type: 'message', replyToMsgId: messageId! } : undefined,
      lastMessageId: selectChatLastMessageId(global, chatId),
      sendAs: selectSendAs(global, chatId),
    }],
  });

  return true;
}
