import type { NoirgramChatListDensity } from '../../global/types/sharedState';

import { CHAT_HEIGHT_PX } from '../../config';

// Chat list rows are virtualized by a fixed height, so the density changes it together with the avatar.
// `large` is the roomy iOS look of Swiftgram, `compact` fits more chats like Telegram Desktop.
const DENSITIES: Record<NoirgramChatListDensity, { height: number; avatarSize: number }> = {
  compact: { height: 60, avatarSize: 42 },
  default: { height: CHAT_HEIGHT_PX, avatarSize: 54 },
  large: { height: 80, avatarSize: 62 },
};

export function getChatHeightPx(density: NoirgramChatListDensity = 'default') {
  return DENSITIES[density].height;
}

export function getChatAvatarSize(density: NoirgramChatListDensity = 'default') {
  return DENSITIES[density].avatarSize;
}
