import type { ChangeEvent } from 'react';
import type { Update } from '@tauri-apps/plugin-updater';
import { memo, useEffect, useMemo, useState } from '../../../lib/teact/teact';
import { getActions } from '../../../global';

import type { RegularLangKey } from '../../../types/language';
import type {
  TauriDesktopSettings, TauriDownloadSettings, TauriNotificationsSetting, TauriProxyKind, TauriProxySettings,
} from '../../../types/tauri';
import type { IRadioOption } from '../../ui/RadioGroup';

import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';

import Island, { IslandDescription, IslandTitle } from '../../gili/layout/Island';
import Button from '../../ui/Button';
import Checkbox from '../../ui/Checkbox';
import InputText from '../../ui/InputText';
import ListItem from '../../ui/ListItem';
import RadioGroup from '../../ui/RadioGroup';

type OwnProps = {
  isActive?: boolean;
};

type ProxyDraft = {
  isEnabled: boolean;
  kind: TauriProxyKind;
  host: string;
  port: string;
};

type UpdateState =
  | { status: 'idle' | 'checking' | 'latest' | 'unavailable' }
  | { status: 'available' | 'installing'; update: Update };

const DEFAULT_PROXY_DRAFT: ProxyDraft = {
  isEnabled: false,
  kind: 'socks5',
  host: '',
  port: '1080',
};
const MAX_PORT = 65535;

// Shown as a cheat sheet; the handlers live in `useDesktopHotkeys`, `LeftColumn`, `ChatList` and `ChatFolders`
const SHORTCUTS: { keys: string; labelKey: RegularLangKey }[] = [
  { keys: 'Ctrl+K', labelKey: 'NoirgramShortcutQuickSearch' },
  { keys: 'Ctrl+Shift+F', labelKey: 'NoirgramShortcutSearch' },
  { keys: 'Ctrl+F', labelKey: 'NoirgramShortcutSearchInChat' },
  { keys: 'Ctrl+Tab · Ctrl+PgDn', labelKey: 'NoirgramShortcutNextChat' },
  { keys: 'Ctrl+Shift+Tab · Ctrl+PgUp', labelKey: 'NoirgramShortcutPreviousChat' },
  { keys: 'Ctrl+1…8', labelKey: 'NoirgramShortcutChatByNumber' },
  { keys: 'Ctrl+Shift+1…9', labelKey: 'NoirgramShortcutFolderByNumber' },
  { keys: 'Ctrl+0', labelKey: 'NoirgramShortcutSaved' },
  { keys: 'Ctrl+9', labelKey: 'NoirgramShortcutArchive' },
  { keys: 'Ctrl+,', labelKey: 'NoirgramShortcutSettings' },
  { keys: 'Ctrl+L', labelKey: 'NoirgramShortcutLock' },
  { keys: 'Ctrl+W', labelKey: 'NoirgramShortcutClose' },
  { keys: 'Ctrl+M', labelKey: 'NoirgramShortcutMinimize' },
  { keys: 'F11', labelKey: 'NoirgramShortcutFullscreen' },
  { keys: 'Ctrl+Q', labelKey: 'NoirgramShortcutQuit' },
];

// Desktop settings live in the Tauri shell: they apply to windows and to the WebView2 environment
const SettingsNoirgramDesktop = ({ isActive }: OwnProps) => {
  const { openDownloadsFolder, showNotification } = getActions();

  const lang = useLang();

  const [downloadSettings, setDownloadSettings] = useState<TauriDownloadSettings | undefined>();
  const [desktopSettings, setDesktopSettings] = useState<TauriDesktopSettings | undefined>();
  const [proxyDraft, setProxyDraft] = useState<ProxyDraft>(DEFAULT_PROXY_DRAFT);
  const [proxyError, setProxyError] = useState<string | undefined>();
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' });
  const [notificationsSetting, setNotificationsSetting] = useState<TauriNotificationsSetting | undefined>();

  useEffect(() => {
    if (!isActive) return;

    window.tauri.getDownloadSettings().then(setDownloadSettings).catch(() => undefined);
    window.tauri.getNativeNotificationsSetting().then(setNotificationsSetting).catch(() => undefined);
    window.tauri.getDesktopSettings().then((settings) => {
      setDesktopSettings(settings);
      setProxyDraft(buildProxyDraft(settings.proxy));
    }).catch(() => undefined);
  }, [isActive]);

  const proxyKindOptions: IRadioOption<TauriProxyKind>[] = useMemo(() => [
    { label: 'SOCKS5', value: 'socks5' },
    { label: 'HTTP', value: 'http' },
  ], []);

  const savedProxyDraft = useMemo(() => buildProxyDraft(desktopSettings?.proxy), [desktopSettings]);
  const isProxyChanged = !areProxyDraftsEqual(proxyDraft, savedProxyDraft);
  const needsRestart = desktopSettings
    && buildProxyUrl(desktopSettings.proxy) !== desktopSettings.activeProxy;

  const handleChooseDownloadFolder = useLastCallback(async () => {
    const newSettings = await window.tauri.chooseDownloadDirectory().catch(() => undefined);
    if (newSettings) setDownloadSettings(newSettings);
  });

  const handleResetDownloadFolder = useLastCallback(async () => {
    const newSettings = await window.tauri.resetDownloadDirectory().catch(() => undefined);
    if (newSettings) setDownloadSettings(newSettings);
  });

  const handleDownloadAskToggle = useLastCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const newSettings = await window.tauri.setDownloadShouldAsk(e.target.checked).catch(() => undefined);
    if (newSettings) setDownloadSettings(newSettings);
  });

  const handleOpenDownloads = useLastCallback(() => {
    openDownloadsFolder();
  });

  const handleLaunchAtStartupToggle = useLastCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const newSettings = await window.tauri.setLaunchAtStartup(e.target.checked).catch(() => undefined);
    if (newSettings) setDesktopSettings(newSettings);
  });

  const handleCloseToTrayToggle = useLastCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const newSettings = await window.tauri.setCloseToTray(e.target.checked).catch(() => undefined);
    if (newSettings) setDesktopSettings(newSettings);
  });

  const updateProxyDraft = useLastCallback((update: Partial<ProxyDraft>) => {
    setProxyDraft((draft) => ({ ...draft, ...update }));
    setProxyError(undefined);
  });

  const handleProxyEnabledToggle = useLastCallback((e: ChangeEvent<HTMLInputElement>) => {
    updateProxyDraft({ isEnabled: e.target.checked });
  });

  const handleProxyKindChange = useLastCallback((value: string) => {
    updateProxyDraft({ kind: value as TauriProxyKind });
  });

  const handleProxyHostChange = useLastCallback((e: ChangeEvent<HTMLInputElement>) => {
    updateProxyDraft({ host: e.target.value });
  });

  const handleProxyPortChange = useLastCallback((e: ChangeEvent<HTMLInputElement>) => {
    updateProxyDraft({ port: e.target.value.replace(/\D/g, '').slice(0, 5) });
  });

  const handleProxySave = useLastCallback(async () => {
    const proxy = buildProxySettings(proxyDraft);
    if (!proxy) {
      setProxyError(lang('NoirgramProxyInvalid'));
      return;
    }

    try {
      const newSettings = await window.tauri.setProxy(proxy);
      setDesktopSettings(newSettings);
      setProxyDraft(buildProxyDraft(newSettings.proxy));
    } catch {
      setProxyError(lang('NoirgramProxyInvalid'));
    }
  });

  const handleRestart = useLastCallback(() => {
    window.tauri.relaunch().catch(() => {
      showNotification({ message: { key: 'ErrorUnspecified' } });
    });
  });

  // Builds without the update channel (`npm run tauri:release`) have no updater, the check then fails
  const handleCheckUpdate = useLastCallback(async () => {
    setUpdateState({ status: 'checking' });
    try {
      const update = await window.tauri.checkUpdate();
      setUpdateState(update ? { status: 'available', update } : { status: 'latest' });
    } catch {
      setUpdateState({ status: 'unavailable' });
    }
  });

  const handleInstallUpdate = useLastCallback(async () => {
    if (updateState.status !== 'available') return;

    const { update } = updateState;
    setUpdateState({ status: 'installing', update });
    try {
      await update.downloadAndInstall();
      await window.tauri.relaunch();
    } catch {
      setUpdateState({ status: 'available', update });
      showNotification({ message: { key: 'ErrorUnspecified' } });
    }
  });

  function renderUpdateItem() {
    switch (updateState.status) {
      case 'available':
        return (
          <ListItem icon="download" narrow onClick={handleInstallUpdate}>
            {lang('NoirgramUpdateInstall', { version: updateState.update.version })}
          </ListItem>
        );
      case 'installing':
        return (
          <ListItem icon="download" narrow disabled>
            {lang('NoirgramUpdateInstalling', { version: updateState.update.version })}
          </ListItem>
        );
      default:
        return (
          <ListItem
            icon="reload"
            narrow
            disabled={updateState.status === 'checking'}
            onClick={handleCheckUpdate}
          >
            <span className="title">{lang('NoirgramUpdateCheck')}</span>
            {updateState.status === 'latest' && (
              <span className="subtitle">{lang('NoirgramUpdateLatest')}</span>
            )}
            {updateState.status === 'unavailable' && (
              <span className="subtitle">{lang('NoirgramUpdateUnavailable')}</span>
            )}
          </ListItem>
        );
    }
  }

  return (
    <>
      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('NoirgramSectionSystem')}</IslandTitle>
      <Island>
        <div className="ListItem with-checkbox">
          <Checkbox
            label={lang('NoirgramLaunchAtStartup')}
            subLabel={lang('NoirgramLaunchAtStartupDesc')}
            checked={Boolean(desktopSettings?.shouldLaunchAtStartup)}
            disabled={!desktopSettings}
            onChange={handleLaunchAtStartupToggle}
          />
        </div>
        <div className="ListItem with-checkbox">
          <Checkbox
            label={lang('NoirgramCloseToTray')}
            subLabel={lang('NoirgramCloseToTrayDesc')}
            checked={Boolean(desktopSettings?.shouldCloseToTray)}
            disabled={!desktopSettings}
            onChange={handleCloseToTrayToggle}
          />
        </div>
      </Island>
      {(notificationsSetting === 'disabled' || notificationsSetting === 'disabledByPolicy') && (
        <IslandDescription dir={lang.isRtl ? 'rtl' : undefined}>
          {lang(notificationsSetting === 'disabledByPolicy'
            ? 'NoirgramNotificationsBlockedByPolicy'
            : 'NoirgramNotificationsBlocked')}
        </IslandDescription>
      )}

      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('NoirgramSectionUpdates')}</IslandTitle>
      <Island>
        {renderUpdateItem()}
      </Island>
      <IslandDescription dir={lang.isRtl ? 'rtl' : undefined}>
        {lang('NoirgramUpdateVersion', { version: window.tauri.version })}
      </IslandDescription>

      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('NoirgramSectionProxy')}</IslandTitle>
      <Island>
        <div className="ListItem with-checkbox">
          <Checkbox
            label={lang('NoirgramProxyEnable')}
            subLabel={lang('NoirgramProxyEnableDesc')}
            checked={proxyDraft.isEnabled}
            disabled={!desktopSettings}
            onChange={handleProxyEnabledToggle}
          />
        </div>
        {proxyDraft.isEnabled && (
          <div className="settings-item">
            <RadioGroup
              name="noirgram-proxy-kind"
              options={proxyKindOptions}
              selected={proxyDraft.kind}
              onChange={handleProxyKindChange}
            />
            <InputText
              label={lang('NoirgramProxyServer')}
              value={proxyDraft.host}
              error={proxyError}
              autoComplete="off"
              maxLength={253}
              onChange={handleProxyHostChange}
            />
            <InputText
              label={lang('NoirgramProxyPort')}
              value={proxyDraft.port}
              inputMode="numeric"
              autoComplete="off"
              onChange={handleProxyPortChange}
            />
          </div>
        )}
        {isProxyChanged && (
          <div className="settings-item">
            <Button onClick={handleProxySave} noForcedUpperCase>{lang('NoirgramProxySave')}</Button>
          </div>
        )}
        {!isProxyChanged && needsRestart && (
          <ListItem icon="reload" narrow onClick={handleRestart}>
            {lang('NoirgramProxyRestart')}
          </ListItem>
        )}
      </Island>
      <IslandDescription dir={lang.isRtl ? 'rtl' : undefined}>
        {lang('NoirgramProxyDesc')}
      </IslandDescription>

      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('NoirgramSectionDownloads')}</IslandTitle>
      <Island>
        <ListItem icon="folder" multiline onClick={handleChooseDownloadFolder}>
          <span className="title">{lang('NoirgramDownloadFolder')}</span>
          <span className="subtitle" dir="auto">{downloadSettings?.directory}</span>
        </ListItem>
        {downloadSettings && !downloadSettings.isDefault && (
          <ListItem icon="undo" narrow onClick={handleResetDownloadFolder}>
            {lang('NoirgramDownloadFolderReset')}
          </ListItem>
        )}
        <div className="ListItem with-checkbox">
          <Checkbox
            label={lang('NoirgramDownloadAsk')}
            subLabel={lang('NoirgramDownloadAskDesc')}
            checked={Boolean(downloadSettings?.shouldAsk)}
            disabled={!downloadSettings}
            onChange={handleDownloadAskToggle}
          />
        </div>
        <ListItem icon="download" narrow onClick={handleOpenDownloads}>
          {lang('NoirgramOpenDownloads')}
        </ListItem>
      </Island>
      <IslandDescription dir={lang.isRtl ? 'rtl' : undefined}>
        {lang('NoirgramDownloadsDesc')}
      </IslandDescription>

      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('NoirgramSectionShortcuts')}</IslandTitle>
      <Island>
        {SHORTCUTS.map(({ keys, labelKey }) => (
          <ListItem key={keys} narrow inactive rightElement={<kbd className="noirgram-kbd">{keys}</kbd>}>
            {lang(labelKey)}
          </ListItem>
        ))}
      </Island>
    </>
  );
};

function buildProxyDraft(proxy?: TauriProxySettings): ProxyDraft {
  if (!proxy) return DEFAULT_PROXY_DRAFT;

  return {
    isEnabled: proxy.isEnabled,
    kind: proxy.kind,
    host: proxy.host,
    port: String(proxy.port),
  };
}

function areProxyDraftsEqual(a: ProxyDraft, b: ProxyDraft) {
  if (a.isEnabled !== b.isEnabled) return false;
  if (!a.isEnabled) return true;

  return a.kind === b.kind && a.host.trim() === b.host.trim() && a.port === b.port;
}

function buildProxySettings(draft: ProxyDraft): TauriProxySettings | undefined {
  const host = draft.host.trim();
  const port = Number(draft.port);
  const isValid = !draft.isEnabled
    || (/^[a-z0-9.\-:[\]]+$/i.test(host) && Number.isInteger(port) && port > 0 && port <= MAX_PORT);
  if (!isValid) return undefined;

  return {
    isEnabled: draft.isEnabled,
    kind: draft.kind,
    host,
    port: port || Number(DEFAULT_PROXY_DRAFT.port),
  };
}

// Same format as the shell builds for `--proxy-server`
function buildProxyUrl(proxy?: TauriProxySettings) {
  if (!proxy?.isEnabled) return undefined;
  return `${proxy.kind}://${proxy.host.trim()}:${proxy.port}`;
}

export default memo(SettingsNoirgramDesktop);
