import { useEffect } from '../../lib/teact/teact';

import { IS_TAURI } from '../../util/browser/globalEnvironment';
import { getHotkeyMatcher } from '../../util/parseHotkey';
import { stepInterfaceScale } from '../../util/tauri/interfaceScale';

type WindowAction = (e: KeyboardEvent) => Promise<void>;

// Window-level shortcuts of Telegram Desktop. They work from inputs too, like in a native window.
const HOTKEYS: Record<string, WindowAction> = {
  // Hides to tray or quits, as "Close to tray" says
  'Ctrl+W': async () => {
    const tauriWindow = await window.tauri.getCurrentWindow();
    await tauriWindow.close();
  },
  'Ctrl+M': async () => {
    const tauriWindow = await window.tauri.getCurrentWindow();
    await tauriWindow.minimize();
  },
  'Ctrl+Q': async () => {
    const { exit } = await import('@tauri-apps/plugin-process');
    await exit(0);
  },
  F11: async () => {
    const tauriWindow = await window.tauri.getCurrentWindow();
    await tauriWindow.setFullscreen(!await tauriWindow.isFullscreen());
  },
  // By physical keys, so they work in any keyboard layout. Ctrl+0 stays Saved Messages, as in Telegram Desktop.
  'Ctrl+Equal': () => stepInterfaceScale(1),
  'Ctrl+Shift+Equal': () => stepInterfaceScale(1),
  'Ctrl+NumpadAdd': () => stepInterfaceScale(1),
  'Ctrl+Minus': () => stepInterfaceScale(-1),
  'Ctrl+NumpadSubtract': () => stepInterfaceScale(-1),
};

const MATCHERS = Object.entries(HOTKEYS).map(([hotkey, action]) => [getHotkeyMatcher(hotkey), action] as const);

export default function useDesktopHotkeys() {
  useEffect(() => {
    if (!IS_TAURI) return undefined;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.repeat) return;

      const match = MATCHERS.find(([matcher]) => matcher(e));
      if (!match) return;

      e.preventDefault();
      void match[1](e).catch(() => undefined);
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}
