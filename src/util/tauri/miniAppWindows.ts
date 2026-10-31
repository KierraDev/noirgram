import type { WebAppInboundEvent, WebAppOutboundEvent } from '../../types/webapp';

type MiniAppEventPayload = {
  label: string;
  eventType: string;
  eventData: string;
};

type MiniAppClosedPayload = {
  label: string;
};

type MiniAppHandlers = {
  onEvent: (event: WebAppInboundEvent) => void;
  onClose: () => void;
};

const LABEL_PREFIX = 'miniapp-';

const handlersByLabel = new Map<string, MiniAppHandlers>();
let listenersPromise: Promise<void> | undefined;

function ensureListeners() {
  listenersPromise ??= import('@tauri-apps/api/event').then(async ({ listen }) => {
    await listen<MiniAppEventPayload>('mini-app-event', ({ payload }) => {
      const handlers = handlersByLabel.get(payload.label);
      if (!handlers) return;

      let eventData: unknown;
      try {
        eventData = payload.eventData ? JSON.parse(payload.eventData) : undefined;
      } catch (err) {
        return;
      }

      handlers.onEvent({ eventType: payload.eventType, eventData } as WebAppInboundEvent);
    });

    await listen<MiniAppClosedPayload>('mini-app-closed', ({ payload }) => {
      const handlers = handlersByLabel.get(payload.label);
      if (!handlers) return;

      handlersByLabel.delete(payload.label);
      handlers.onClose();
    });
  });

  return listenersPromise;
}

export function getMiniAppWindowLabel(webAppKey: string) {
  let hash = 0;
  for (let i = 0; i < webAppKey.length; i++) {
    hash = Math.imul(31, hash) + webAppKey.charCodeAt(i) | 0;
  }

  return `${LABEL_PREFIX}${(hash >>> 0).toString(36)}-${webAppKey.length.toString(36)}`;
}

export async function openMiniAppWindow(
  label: string, url: string, title: string, handlers: MiniAppHandlers,
) {
  handlersByLabel.set(label, handlers);
  await ensureListeners();

  try {
    await window.tauri.openMiniAppWindow(label, url, title);
  } catch (err) {
    handlersByLabel.delete(label);
    throw err;
  }
}

export function closeMiniAppWindow(label: string) {
  if (!handlersByLabel.delete(label)) return;
  void window.tauri.closeMiniAppWindow(label);
}

export function sendMiniAppEvent(label: string, event: WebAppOutboundEvent) {
  if (!handlersByLabel.has(label)) return;
  const eventData = 'eventData' in event ? event.eventData : undefined;
  void window.tauri.sendMiniAppEvent(label, event.eventType, eventData).catch(() => undefined);
}
