# Noirgram

Десктоп-клиент Telegram для Windows с тёмным «нуар»-оформлением в духе Swiftgram: стеклянная шапка чата и поле ввода, фирменный голубой `#87A6DF`, пружинные анимации.

Основан на [Telegram Web A](https://github.com/Ajaxy/telegram-tt) — официальном веб-клиенте Telegram — и упакован в нативное приложение на [Tauri 2](https://tauri.app).

**[Скачать последнюю версию](https://github.com/KierraDev/noirgram/releases/latest)** — `Noirgram_<версия>_x64-setup.exe`

## Возможности

**Окно и система**
- Своя стеклянная строка заголовка, сворачивание в трей, автозапуск вместе с Windows
- Повторный запуск возвращает окно из трея, размер и положение окна запоминаются
- Масштаб интерфейса 80–200% (`Ctrl+=` / `Ctrl+−`)
- Прокси SOCKS5 и HTTP для всего приложения
- Автообновления

**Сообщения и файлы**
- Уведомления Windows с полем ответа и кнопкой «Прочитано»
- Перетаскивание фото, видео и файлов из чата в Проводник
- Отдельное окно для фото и видео с зумом
- Своя папка загрузок, «Сохранить как…», вопрос о месте сохранения для каждого файла
- Экспорт истории чата в HTML
- Мини-приложения ботов в отдельных окнах

**Оформление**
- Семь цветов акцента, плотность списка чатов: компактный, стандартный, крупный
- Шрифт Inter, круглые или скруглённо-квадратные аватары
- Скрытие историй, секунды во времени сообщений, ID в профилях, отключение статуса «печатает»

**Управление**
- Горячие клавиши Telegram Desktop: `Ctrl+K`, `Ctrl+Tab`, `Ctrl+1…8`, `Ctrl+0`, `Ctrl+W`, `F11` и другие — полный список в «Настройки › Noirgram»
- Интерфейс на русском и английском (настройки Noirgram переведены отдельно)

## Ограничения

- MTProto-прокси и прокси с паролем не поддерживаются: клиент работает через веб-протокол Telegram.
- Секретных чатов нет — как и в Telegram Desktop.
- Установщик пока не подписан сертификатом, поэтому Windows SmartScreen может предупредить при первом запуске.

## Сборка из исходников

Нужны [Node.js](https://nodejs.org) 24+, [Rust](https://rustup.rs) 1.97+ и WebView2 (встроен в Windows 10 и 11).

1. Получите API ID и API hash на [my.telegram.org](https://my.telegram.org) и запишите их в `.env`:
   ```
   cp .env.example .env
   ```
2. Установите зависимости:
   ```
   npm i
   ```
3. Запуск для разработки:
   ```
   npm run tauri:dev
   ```
4. Сборка установщика — `tauri/target/release/bundle/nsis/`:
   ```
   npm run tauri:build
   ```

Веб-версия без оболочки запускается через `npm run dev`.

### Релиз с автообновлениями

```
NOIRGRAM_UPDATE_URL=https://github.com/KierraDev/noirgram/releases/latest/download/latest.json npm run tauri:release
```

Скрипт собирает подписанный установщик и `latest.json` — оба файла прикладываются к релизу на GitHub. Ключ подписи создаётся при первом запуске в `~/.tauri/noirgram-updater.key`: без него следующие обновления не установятся, храните его отдельно от репозитория.

## Авторы

- [KierraDev](https://github.com/KierraDev)
- [ecronxy](https://github.com/ecronxy)

## Лицензия

[GPL-3.0](LICENSE), как и у Telegram Web A, на котором основан Noirgram. Noirgram — неофициальный клиент и не связан с Telegram.

### Использованные проекты

- [Telegram Web A](https://github.com/Ajaxy/telegram-tt) и [Teact](https://github.com/Ajaxy/teact) ([GPL-3.0](https://github.com/Ajaxy/telegram-tt/blob/master/LICENSE))
- [Tauri](https://github.com/tauri-apps/tauri) ([MIT / Apache 2.0](https://github.com/tauri-apps/tauri/blob/dev/LICENSE_MIT))
- [GramJS](https://github.com/gram-js/gramjs) ([MIT](https://github.com/gram-js/gramjs/blob/master/LICENSE))
- [Inter](https://github.com/rsms/inter) ([OFL 1.1](https://github.com/rsms/inter/blob/master/LICENSE.txt))
- [drag-rs](https://github.com/crabnebula-dev/drag-rs) ([MIT / Apache 2.0](https://github.com/crabnebula-dev/drag-rs))
- [fflate](https://github.com/101arrowz/fflate) ([MIT](https://github.com/101arrowz/fflate/blob/master/LICENSE))
- [cryptography](https://github.com/spalt08/cryptography) ([Apache 2.0](https://github.com/spalt08/cryptography/blob/master/LICENSE))
- [emoji-data](https://github.com/iamcal/emoji-data) ([MIT](https://github.com/iamcal/emoji-data/blob/master/LICENSE))
- [twemoji-parser](https://github.com/jdecked/twemoji-parser) ([MIT](https://github.com/jdecked/twemoji-parser/blob/master/LICENSE.md))
- [tlottie](https://github.com/dkaraush/tlottie) ([MIT](https://github.com/dkaraush/tlottie/))
- [opus-recorder](https://github.com/chris-rudmin/opus-recorder) ([разные лицензии](https://github.com/chris-rudmin/opus-recorder/blob/master/LICENSE.md))
- [qr-code-styling](https://github.com/kozakdenys/qr-code-styling) ([MIT](https://github.com/kozakdenys/qr-code-styling/blob/master/LICENSE))
- [music-metadata](https://github.com/Borewit/music-metadata) ([MIT](https://github.com/Borewit/music-metadata/blob/master/LICENSE.txt))
- [Tiptap](https://github.com/ueberdosis/tiptap) ([MIT](https://github.com/ueberdosis/tiptap/blob/main/LICENSE.md))
- [marked](https://github.com/markedjs/marked) ([MIT](https://github.com/markedjs/marked/blob/master/LICENSE.md))
- [lowlight](https://github.com/wooorm/lowlight) ([MIT](https://github.com/wooorm/lowlight/blob/main/license))
- [idb-keyval](https://github.com/jakearchibald/idb-keyval) ([Apache 2.0](https://github.com/jakearchibald/idb-keyval/blob/main/LICENCE))
- [fasttextweb](https://github.com/karmdesai/fastTextWeb), fastblur

## Ошибки и предложения

Пишите в [Issues](https://github.com/KierraDev/noirgram/issues).
