import { memo, useMemo } from '../../../lib/teact/teact';
import { getActions } from '../../../global';

import type { NoirgramAvatarShape, NoirgramSettings } from '../../../global/types/sharedState';
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
            <ListItem icon="folder" narrow onClick={handleOpenDownloads}>
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
