import type { Window as TauriWindow } from '@tauri-apps/api/window';
import type { Update } from '@tauri-apps/plugin-updater';

export type TauriDownloadSettings = {
  directory: string;
  isDefault: boolean;
  shouldAsk: boolean;
};

export type TauriProxyKind = 'socks5' | 'http';

export type TauriProxySettings = {
  isEnabled: boolean;
  kind: TauriProxyKind;
  host: string;
  port: number;
};

export type TauriDesktopSettings = {
  shouldCloseToTray: boolean;
  shouldLaunchAtStartup: boolean;
  proxy?: TauriProxySettings;
  // Proxy URL the running app was started with; proxy changes apply after a restart
  activeProxy?: string;
};

export type TauriNativeNotification = {
  chatId: string;
  messageId?: number;
  title: string;
  body: string;
  iconKey?: string;
  isSilent: boolean;
  // Without labels the toast has no reply box and buttons
  replyPlaceholder?: string;
  replyLabel?: string;
  readLabel?: string;
};

// Whether Windows lets the app show toasts at all
export type TauriNotificationsSetting = 'enabled' | 'disabled' | 'disabledByPolicy' | 'unknown';

export type TauriNotificationAction = {
  action: 'open' | 'reply' | 'read';
  chatId: string;
  messageId?: number;
  text?: string;
};

export type TauriMediaWindowOptions = {
  src: string;
  title: string;
  isVideo: boolean;
  width?: number;
  height?: number;
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
  prepareDownload: (url: string, filename: string, shouldAsk?: boolean) => Promise<boolean>;
  getDesktopSettings: () => Promise<TauriDesktopSettings>;
  setCloseToTray: (shouldCloseToTray: boolean) => Promise<TauriDesktopSettings>;
  setLaunchAtStartup: (shouldLaunchAtStartup: boolean) => Promise<TauriDesktopSettings>;
  setProxy: (proxy?: TauriProxySettings) => Promise<TauriDesktopSettings>;
  isNativeNotificationsSupported: () => Promise<boolean>;
  getNativeNotificationsSetting: () => Promise<TauriNotificationsSetting>;
  showNativeNotification: (notification: TauriNativeNotification, icon?: Uint8Array) => Promise<void>;
  closeNativeNotifications: (chatId: string) => Promise<void>;
  startFileDrag: (data: Uint8Array, filename: string) => Promise<void>;
  openMediaWindow: (options: TauriMediaWindowOptions) => Promise<void>;
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
