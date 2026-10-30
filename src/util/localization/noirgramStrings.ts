import type { LangKey } from '../../types/language';

// Telegram language packs come from Telegram servers and know nothing about Noirgram strings, so their
// translations ship with the app. English lives in `fallback.strings`; keys missing here fall back to it.
const NOIRGRAM_STRINGS: Record<string, Partial<Record<LangKey, string>>> = {
  ru: {
    NoirgramSettings: 'Noirgram',
    NoirgramSettingsDesc: 'Функции клиента, прокси, загрузки и горячие клавиши',
    NoirgramSectionInterface: 'Интерфейс',
    NoirgramHideStories: 'Скрыть истории',
    NoirgramHideStoriesDesc: 'Убрать ленту историй над списком чатов',
    NoirgramMessageSeconds: 'Секунды во времени сообщений',
    NoirgramMessageSecondsDesc: '21:30:42 вместо 21:30',
    NoirgramShowPeerId: 'Показывать ID в профилях',
    NoirgramShowPeerIdDesc: 'ID пользователей, ботов, групп и каналов, нажмите, чтобы скопировать',
    NoirgramPeerId: 'ID',
    NoirgramPeerIdCopied: 'ID скопирован в буфер обмена.',
    NoirgramSectionAvatars: 'Форма аватарок',
    NoirgramAvatarCircle: 'Круг',
    NoirgramAvatarSquircle: 'Скруглённый квадрат',
    NoirgramSectionPrivacy: 'Конфиденциальность',
    NoirgramHideTyping: 'Не отправлять статус набора',
    NoirgramHideTypingDesc: 'Никто не увидит, что вы печатаете или записываете',
    NoirgramPrivacyDesc: 'Отметки о прочтении и статус «в сети» по-прежнему подчиняются '
      + 'настройкам конфиденциальности Telegram.',
    NoirgramSectionDownloads: 'Загрузки',
    NoirgramOpenDownloads: 'Открыть папку загрузок',
    NoirgramDownloadsDesc: 'Файлы сохраняются прямо в эту папку. '
      + 'Включите вопрос, чтобы выбирать место для каждого файла.',
    NoirgramDownloadSaved: '{file} сохранён',
    NoirgramDownloadFolder: 'Папка загрузок',
    NoirgramDownloadFolderReset: 'Вернуть стандартную папку',
    NoirgramDownloadAsk: 'Спрашивать, куда сохранять',
    NoirgramDownloadAskDesc: 'Показывать окно «Сохранить как» перед каждой загрузкой',
    NoirgramShowInFolder: 'Показать в папке',
    NoirgramSaveAs: 'Сохранить как…',
    NoirgramSectionSystem: 'Система',
    NoirgramLaunchAtStartup: 'Запускать вместе с системой',
    NoirgramLaunchAtStartupDesc: 'Запускается свёрнутым в трей',
    NoirgramCloseToTray: 'Сворачивать в трей при закрытии',
    NoirgramCloseToTrayDesc: 'Закрытие окна оставляет Noirgram работать в трее',
    NoirgramSectionProxy: 'Прокси',
    NoirgramProxyEnable: 'Использовать прокси',
    NoirgramProxyEnableDesc: 'Весь трафик приложения пойдёт через него',
    NoirgramProxyServer: 'Сервер',
    NoirgramProxyPort: 'Порт',
    NoirgramProxySave: 'Сохранить прокси',
    NoirgramProxyInvalid: 'Проверьте сервер и порт',
    NoirgramProxyRestart: 'Перезапустить Noirgram, чтобы применить',
    NoirgramProxyDesc: 'Поддерживаются прокси SOCKS5 и HTTP без пароля. '
      + 'MTProto-прокси требуют нативного протокола Telegram и в этом клиенте не работают.',
    NoirgramSectionShortcuts: 'Горячие клавиши',
    NoirgramShortcutQuickSearch: 'Быстрый переход к чату',
    NoirgramShortcutSearch: 'Поиск везде',
    NoirgramShortcutSearchInChat: 'Поиск в чате',
    NoirgramShortcutNextChat: 'Следующий чат',
    NoirgramShortcutPreviousChat: 'Предыдущий чат',
    NoirgramShortcutChatByNumber: 'Открыть чат по номеру в списке',
    NoirgramShortcutFolderByNumber: 'Переключить папку',
    NoirgramShortcutSaved: 'Избранное',
    NoirgramShortcutArchive: 'Архив',
    NoirgramShortcutSettings: 'Настройки',
    NoirgramShortcutLock: 'Заблокировать код-паролем',
    NoirgramShortcutClose: 'Закрыть окно',
    NoirgramShortcutMinimize: 'Свернуть',
    NoirgramShortcutFullscreen: 'Полноэкранный режим',
    NoirgramShortcutQuit: 'Выйти из Noirgram',
    NoirgramMiniAppInWindow: 'Мини-приложение открыто в отдельном окне',
    NoirgramMiniAppShowWindow: 'Показать окно',
  },
};

export function getNoirgramString(langKey: string, langCode?: string, baseLangCode?: string) {
  const key = langKey as LangKey;
  return (langCode ? NOIRGRAM_STRINGS[langCode]?.[key] : undefined)
    ?? (baseLangCode ? NOIRGRAM_STRINGS[baseLangCode]?.[key] : undefined);
}
