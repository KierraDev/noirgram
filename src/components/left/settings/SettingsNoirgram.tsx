import { memo, useEffect, useMemo, useState } from '../../../lib/teact/teact';
import { getActions } from '../../../global';

import type { NoirgramAvatarShape, NoirgramSettings } from '../../../global/types/sharedState';
import type { TauriDownloadSettings } from '../../../types/tauri';
import type { IRadioOption } from '../../ui/RadioGroup';

import { selectNoirgramSettings } from '../../../global/selectors/sharedState';
import { IS_TAURI } from '../../../util/browser/globalEnvironment';

import useSelector from '../../../hooks/data/useSelector';
import useHistoryBack from '../../../hooks/useHistoryBack';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';

import Island, { IslandDescription, IslandTitle } from '../../gili/layout/Island';
import Checkbox from '../../ui/Checkbox';
import ListItem from '../../ui/ListItem';
import RadioGroup from '../../ui/RadioGroup';

type OwnProps = {
  isActive?: boolean;
  onReset: () => void;
};

type ToggleKey = Exclude<keyof NoirgramSettings, 'avatarShape'>;

const SettingsNoirgram = ({
  isActive,
  onReset,
}: OwnProps) => {
  const { updateNoirgramSettings, openDownloadsFolder } = getActions();

  const lang = useLang();
  const settings = useSelector(selectNoirgramSettings);
  // Kept by the desktop shell, which applies them to every download
  const [downloadSettings, setDownloadSettings] = useState<TauriDownloadSettings | undefined>();

  useEffect(() => {
    if (!IS_TAURI || !isActive) return;
    window.tauri.getDownloadSettings().then(setDownloadSettings).catch(() => undefined);
  }, [isActive]);

  useHistoryBack({
    isActive,
    onBack: onReset,
  });

  const avatarShapeOptions: IRadioOption<NoirgramAvatarShape>[] = useMemo(() => [
    { label: lang('NoirgramAvatarCircle'), value: 'circle' },
    { label: lang('NoirgramAvatarSquircle'), value: 'squircle' },
  ], [lang]);

  const handleToggle = useLastCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    updateNoirgramSettings({ [name as ToggleKey]: checked });
  });

  const handleAvatarShapeChange = useLastCallback((value: string) => {
    updateNoirgramSettings({ avatarShape: value as NoirgramAvatarShape });
  });

  const handleOpenDownloads = useLastCallback(() => {
    openDownloadsFolder();
  });

  const handleChooseDownloadFolder = useLastCallback(async () => {
    const newSettings = await window.tauri.chooseDownloadDirectory().catch(() => undefined);
    if (newSettings) setDownloadSettings(newSettings);
  });

  const handleResetDownloadFolder = useLastCallback(async () => {
    const newSettings = await window.tauri.resetDownloadDirectory().catch(() => undefined);
    if (newSettings) setDownloadSettings(newSettings);
  });

  const handleDownloadAskToggle = useLastCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSettings = await window.tauri.setDownloadShouldAsk(e.target.checked).catch(() => undefined);
    if (newSettings) setDownloadSettings(newSettings);
  });

  function renderToggle(key: ToggleKey, label: string, subLabel: string) {
    return (
      <div className="ListItem with-checkbox">
        <Checkbox
          name={key}
          label={label}
          subLabel={subLabel}
          checked={Boolean(settings[key])}
          onChange={handleToggle}
        />
      </div>
    );
  }

  return (
    <div className="settings-content custom-scroll">
      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('NoirgramSectionInterface')}</IslandTitle>
      <Island>
        {renderToggle('shouldHideStories', lang('NoirgramHideStories'), lang('NoirgramHideStoriesDesc'))}
        {renderToggle(
          'shouldShowMessageSeconds', lang('NoirgramMessageSeconds'), lang('NoirgramMessageSecondsDesc'),
        )}
        {renderToggle('shouldShowPeerId', lang('NoirgramShowPeerId'), lang('NoirgramShowPeerIdDesc'))}
      </Island>

      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('NoirgramSectionAvatars')}</IslandTitle>
      <Island>
        <RadioGroup
          name="noirgram-avatar-shape"
          options={avatarShapeOptions}
          selected={settings.avatarShape || 'circle'}
          onChange={handleAvatarShapeChange}
        />
      </Island>

      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('NoirgramSectionPrivacy')}</IslandTitle>
      <Island>
        {renderToggle(
          'shouldHideTypingStatus', lang('NoirgramHideTyping'), lang('NoirgramHideTypingDesc'),
        )}
      </Island>
      <IslandDescription dir={lang.isRtl ? 'rtl' : undefined}>
        {lang('NoirgramPrivacyDesc')}
      </IslandDescription>

      {IS_TAURI && (
        <>
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
        </>
      )}
    </div>
  );
};

export default memo(SettingsNoirgram);
