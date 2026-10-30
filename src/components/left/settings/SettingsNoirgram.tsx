import { memo, useMemo } from '../../../lib/teact/teact';
import { getActions } from '../../../global';

import type {
  NoirgramAccent, NoirgramAvatarShape, NoirgramChatListDensity, NoirgramSettings,
} from '../../../global/types/sharedState';
import type { RegularLangKey } from '../../../types/language';
import type { IRadioOption } from '../../ui/RadioGroup';

import { selectNoirgramSettings } from '../../../global/selectors/sharedState';
import { IS_TAURI } from '../../../util/browser/globalEnvironment';
import buildClassName from '../../../util/buildClassName';

import useSelector from '../../../hooks/data/useSelector';
import useHistoryBack from '../../../hooks/useHistoryBack';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';

import Island, { IslandDescription, IslandTitle } from '../../gili/layout/Island';
import Checkbox from '../../ui/Checkbox';
import RadioGroup from '../../ui/RadioGroup';
import SettingsNoirgramDesktop from './SettingsNoirgramDesktop';

type OwnProps = {
  isActive?: boolean;
  onReset: () => void;
};

type ToggleKey = Exclude<keyof NoirgramSettings, 'avatarShape' | 'accent' | 'chatListDensity'>;

// Swatch colors only; the theme values live in `styles/noirgram/_personalize.scss`
const ACCENTS: { value: NoirgramAccent; color: string; labelKey: RegularLangKey }[] = [
  { value: 'noir', color: '#87a6df', labelKey: 'NoirgramAccentNoir' },
  { value: 'violet', color: '#8c7be6', labelKey: 'NoirgramAccentViolet' },
  { value: 'teal', color: '#3fb3ab', labelKey: 'NoirgramAccentTeal' },
  { value: 'rose', color: '#e0709a', labelKey: 'NoirgramAccentRose' },
  { value: 'amber', color: '#e0a040', labelKey: 'NoirgramAccentAmber' },
  { value: 'green', color: '#5db56e', labelKey: 'NoirgramAccentGreen' },
  { value: 'silver', color: '#a9adb5', labelKey: 'NoirgramAccentSilver' },
];

const SettingsNoirgram = ({
  isActive,
  onReset,
}: OwnProps) => {
  const { updateNoirgramSettings } = getActions();

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

  const densityOptions: IRadioOption<NoirgramChatListDensity>[] = useMemo(() => [
    { label: lang('NoirgramDensityCompact'), subLabel: lang('NoirgramDensityCompactDesc'), value: 'compact' },
    { label: lang('NoirgramDensityDefault'), value: 'default' },
    { label: lang('NoirgramDensityLarge'), subLabel: lang('NoirgramDensityLargeDesc'), value: 'large' },
  ], [lang]);

  const handleAvatarShapeChange = useLastCallback((value: string) => {
    updateNoirgramSettings({ avatarShape: value as NoirgramAvatarShape });
  });

  const handleDensityChange = useLastCallback((value: string) => {
    updateNoirgramSettings({ chatListDensity: value as NoirgramChatListDensity });
  });

  const handleAccentClick = useLastCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    updateNoirgramSettings({ accent: e.currentTarget.dataset.accent as NoirgramAccent });
  });

  const currentAccent = settings.accent || 'noir';

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
      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('NoirgramSectionAccent')}</IslandTitle>
      <Island>
        <div className="noirgram-accents" role="radiogroup" aria-label={lang('NoirgramSectionAccent')}>
          {ACCENTS.map(({ value, color, labelKey }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={currentAccent === value}
              aria-label={lang(labelKey)}
              title={lang(labelKey)}
              data-accent={value}
              className={buildClassName('noirgram-accent', currentAccent === value && 'is-selected')}
              style={`--accent-swatch: ${color}`}
              onClick={handleAccentClick}
            />
          ))}
        </div>
      </Island>

      <IslandTitle dir={lang.isRtl ? 'rtl' : undefined}>{lang('NoirgramSectionChatList')}</IslandTitle>
      <Island>
        <RadioGroup
          name="noirgram-chat-list-density"
          options={densityOptions}
          selected={settings.chatListDensity || 'default'}
          onChange={handleDensityChange}
        />
      </Island>

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

      {IS_TAURI && <SettingsNoirgramDesktop isActive={isActive} />}
    </div>
  );
};

export default memo(SettingsNoirgram);
