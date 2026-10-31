import { useEffect } from '../../lib/teact/teact';
import { getGlobal } from '../../global';

import { ApiMediaFormat } from '../../api/types';

import { getMediaFilename, getMediaHash } from '../../global/helpers';
import {
  selectChatMessage,
  selectCurrentMessageList,
  selectIsMessageProtected,
} from '../../global/selectors';
import { selectMessageDownloadableMedia } from '../../global/selectors/media';
import { IS_TAURI } from '../../util/browser/globalEnvironment';
import * as mediaLoader from '../../util/mediaLoader';

const DRAG_THRESHOLD = 6;
const MAX_LOAD_SIZE = 64 * 1024 * 1024;
const DRAGGABLE_SELECTOR = '.media-inner, .File, .Audio';
const NOT_DRAGGABLE_SELECTOR = '.AnimatedEmoji, .Sticker, .WebPage, .RoundVideo, button, a';

type DragCandidate = {
  chatId: string;
  messageId: number;
  startX: number;
  startY: number;
};

function getMessageId(target: HTMLElement) {
  const albumItem = target.closest<HTMLElement>('[id^="album-media-message-"]');
  const albumMessageId = albumItem?.id.match(/^album-media-message-(\d+)/)?.[1];
  if (albumMessageId) return Number(albumMessageId);

  const messageId = target.closest<HTMLElement>('.Message[data-message-id]')?.dataset.messageId;
  return messageId ? Number(messageId) : undefined;
}

function getCandidate(e: PointerEvent): DragCandidate | undefined {
  const target = e.target as HTMLElement | null;
  if (!target?.closest || !target.closest('.MessageList')) return undefined;

  const mediaElement = target.closest(DRAGGABLE_SELECTOR);
  if (!mediaElement || (target.closest(NOT_DRAGGABLE_SELECTOR) && !target.closest('.File'))) return undefined;

  const messageId = getMessageId(target);
  const { chatId } = selectCurrentMessageList(getGlobal()) || {};
  if (!chatId || !messageId) return undefined;

  return {
    chatId, messageId, startX: e.clientX, startY: e.clientY,
  };
}

async function loadFile({ chatId, messageId }: DragCandidate) {
  const global = getGlobal();
  const message = selectChatMessage(global, chatId, messageId);
  if (!message || selectIsMessageProtected(global, message)) return undefined;

  const media = selectMessageDownloadableMedia(global, message);
  if (!media || media.mediaType === 'sticker') return undefined;

  const hash = getMediaHash(media, 'download');
  if (!hash) return undefined;

  let url: unknown = mediaLoader.getFromMemory(hash);
  if (!url) {
    const size = 'size' in media ? media.size : 0;
    if (size > MAX_LOAD_SIZE) return undefined;

    url = await mediaLoader.fetch(hash, ApiMediaFormat.BlobUrl);
  }
  if (typeof url !== 'string') return undefined;

  const response = await fetch(url);
  return {
    data: new Uint8Array(await response.arrayBuffer()),
    filename: getMediaFilename(media),
  };
}

export default function useFileDragOut() {
  useEffect(() => {
    if (!IS_TAURI) return undefined;

    let candidate: DragCandidate | undefined;

    function reset() {
      candidate = undefined;
    }

    function handlePointerDown(e: PointerEvent) {
      candidate = e.button === 0 && e.pointerType === 'mouse' ? getCandidate(e) : undefined;
    }

    function handlePointerMove(e: PointerEvent) {
      if (!candidate || !(e.buttons & 1)) return;
      if (Math.hypot(e.clientX - candidate.startX, e.clientY - candidate.startY) < DRAG_THRESHOLD) return;

      const dragged = candidate;
      candidate = undefined;
      window.getSelection()?.removeAllRanges();

      void loadFile(dragged)
        .then((file) => file && window.tauri.startFileDrag(file.data, file.filename))
        .catch(() => undefined);
    }

    function handleDragStart(e: DragEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('.MessageList') && target.closest(DRAGGABLE_SELECTOR)) {
        e.preventDefault();
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('pointermove', handlePointerMove, true);
    document.addEventListener('pointerup', reset, true);
    document.addEventListener('pointercancel', reset, true);
    document.addEventListener('dragstart', handleDragStart, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('pointermove', handlePointerMove, true);
      document.removeEventListener('pointerup', reset, true);
      document.removeEventListener('pointercancel', reset, true);
      document.removeEventListener('dragstart', handleDragStart, true);
    };
  }, []);
}
