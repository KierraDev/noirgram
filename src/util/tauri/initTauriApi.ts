import { IS_MAC_OS } from '../browser/windowEnvironment';

export default function initTauriApi() {
  const corePromise = import('@tauri-apps/api/core');
  async function markTitleBarOverlay(isOverlay: boolean, isMobile?: boolean) {
    if (!IS_MAC_OS) return;
    const core = await corePromise;
    return core.invoke<void>('mark_title_bar_overlay', { isOverlay, isMobile });
  }

  async function setNotificationsCount(amount: number, isMuted = false) {
    const core = await corePromise;
    return core.invoke<void>('set_notifications_count', { amount, isMuted });
  }

  async function openNewWindow(url: string) {
    const core = await corePromise;
    return core.invoke<boolean>('open_new_window_cmd', { url });
  }

  async function setWindowTitle(title: string) {
    const core = await corePromise;
    return core.invoke<void>('set_window_title', { title });
  }

  async function revealDownload(path: string) {
    const core = await corePromise;
    return core.invoke<void>('reveal_download', { path });
  }

  async function openDownloadsFolder() {
    const core = await corePromise;
    return core.invoke<void>('open_downloads_folder');
  }

  async function openMiniAppWindow(label: string, url: string, title: string) {
    const core = await corePromise;
    return core.invoke<void>('open_mini_app_window', { label, url, title });
  }

  async function closeMiniAppWindow(label: string) {
    const core = await corePromise;
    return core.invoke<void>('close_mini_app_window', { label });
  }

  async function sendMiniAppEvent(label: string, eventType: string, eventData?: unknown) {
    const core = await corePromise;
    return core.invoke<void>('mini_app_send_event', { label, eventType, eventData });
  }

  // @ts-expect-error
  window.tauri ??= {};
  Object.assign(window.tauri, {
    markTitleBarOverlay,
    setNotificationsCount,
    openNewWindow,
    revealDownload,
    openDownloadsFolder,
    openMiniAppWindow,
    closeMiniAppWindow,
    sendMiniAppEvent,
    relaunch: () => import('@tauri-apps/plugin-process').then(({ relaunch }) => relaunch()),
    checkUpdate: () => import('@tauri-apps/plugin-updater').then(({ check }) => check()),
    getCurrentWindow: () => import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow()),
    setWindowTitle,
  });
}
