import type { Window as TauriWindow } from '@tauri-apps/api/window';
import type { Update } from '@tauri-apps/plugin-updater';

export type TauriDownloadSettings = {
  directory: string;
  isDefault: boolean;
  shouldAsk: boolean;
};

type TauriApi = {
  version: string;
  markTitleBarOverlay: (isOverlay: boolean, isMobile?: boolean) => Promise<void>;
  setNotificationsCount: (amount: number, isMuted?: boolean) => Promise<void>;
  openNewWindow: (url: string) => Promise<void>;
  relaunch: () => Promise<void>;
  checkUpdate: () => Promise<Update | null>;
  getCurrentWindow: () => Promise<TauriWindow>;
  setWindowTitle: (title: string) => Promise<void>;
  revealDownload: (path: string) => Promise<void>;
  openDownloadsFolder: () => Promise<void>;
  getDownloadSettings: () => Promise<TauriDownloadSettings>;
  chooseDownloadDirectory: () => Promise<TauriDownloadSettings | undefined>;
  resetDownloadDirectory: () => Promise<TauriDownloadSettings>;
  setDownloadShouldAsk: (shouldAsk: boolean) => Promise<TauriDownloadSettings>;
  prepareDownload: (url: string, filename: string) => Promise<boolean>;
  openMiniAppWindow: (label: string, url: string, title: string) => Promise<void>;
  closeMiniAppWindow: (label: string) => Promise<void>;
  sendMiniAppEvent: (label: string, eventType: string, eventData?: unknown) => Promise<void>;
};

declare global {
  interface Window {
    tauri: TauriApi;
  }
}

export {};
