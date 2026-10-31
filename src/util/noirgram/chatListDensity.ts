import type { NoirgramChatListDensity } from '../../global/types/sharedState';

import { CHAT_HEIGHT_PX } from '../../config';

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
