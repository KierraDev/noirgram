import type { Window as TauriWindow } from '@tauri-apps/api/window';
import { memo, useEffect, useState } from '../../lib/teact/teact';

import { PAGE_TITLE_TAURI } from '../../config';
import buildClassName from '../../util/buildClassName';

import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import styles from './WindowTitleBar.module.scss';

import noirgramGlyphPath from '../../assets/noirgram-glyph.svg';

const DOUBLE_CLICK_DETAIL = 2;

const WindowTitleBar = () => {
  const lang = useLang();

  const [tauriWindow, setTauriWindow] = useState<TauriWindow | undefined>();
  const [isMaximized, setIsMaximized] = useState(false);
  const [isFocused, setIsFocused] = useState(true);

  useEffect(() => {
    let isUnmounted = false;
    const unlisteners: (() => void)[] = [];

    void window.tauri.getCurrentWindow().then(async (currentWindow) => {
      if (isUnmounted) return;

      setTauriWindow(currentWindow);
      setIsMaximized(await currentWindow.isMaximized());

      const unlistenResize = await currentWindow.onResized(async () => {
        setIsMaximized(await currentWindow.isMaximized());
      });
      const unlistenFocus = await currentWindow.onFocusChanged(({ payload }) => {
        setIsFocused(payload);
      });

      if (isUnmounted) {
        unlistenResize();
        unlistenFocus();
        return;
      }

      unlisteners.push(unlistenResize, unlistenFocus);
    });

    return () => {
      isUnmounted = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  const handleDragAreaMouseDown = useLastCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !tauriWindow) return;

    // `startDragging` swallows the native `dblclick`, so double clicks are detected on `mousedown`
    if (e.detail === DOUBLE_CLICK_DETAIL) {
      void tauriWindow.toggleMaximize();
      return;
    }

    void tauriWindow.startDragging();
  });

  const handleMinimize = useLastCallback(() => {
    void tauriWindow?.minimize();
  });

  const handleToggleMaximize = useLastCallback(() => {
    void tauriWindow?.toggleMaximize();
  });

  const handleClose = useLastCallback(() => {
    void tauriWindow?.close();
  });

  return (
    <div className={buildClassName(styles.root, !isFocused && styles.blurred)}>
      <div className={styles.dragArea} onMouseDown={handleDragAreaMouseDown}>
        <img className={styles.logo} src={noirgramGlyphPath} alt="" draggable={false} />
        <span className={styles.title}>{PAGE_TITLE_TAURI}</span>
      </div>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.control}
          aria-label={lang('WindowMinimize')}
          title={lang('WindowMinimize')}
          tabIndex={-1}
          onClick={handleMinimize}
        >
          <svg className={styles.glyph} viewBox="0 0 10 10" aria-hidden>
            <path d="M0.5 5h9" />
          </svg>
        </button>
        <button
          type="button"
          className={styles.control}
          aria-label={lang(isMaximized ? 'WindowRestore' : 'WindowMaximize')}
          title={lang(isMaximized ? 'WindowRestore' : 'WindowMaximize')}
          tabIndex={-1}
          onClick={handleToggleMaximize}
        >
          {isMaximized ? (
            <svg className={styles.glyph} viewBox="0 0 10 10" aria-hidden>
              <rect x="0.5" y="2.5" width="7" height="7" rx="1.5" />
              <path d="M2.5 2.5V2a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 9.5 2v4A1.5 1.5 0 0 1 8 7.5h-0.5" />
            </svg>
          ) : (
            <svg className={styles.glyph} viewBox="0 0 10 10" aria-hidden>
              <rect x="0.5" y="0.5" width="9" height="9" rx="2" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className={buildClassName(styles.control, styles.close)}
          aria-label={lang('Close')}
          title={lang('Close')}
          tabIndex={-1}
          onClick={handleClose}
        >
          <svg className={styles.glyph} viewBox="0 0 10 10" aria-hidden>
            <path d="M1 1l8 8M9 1l-8 8" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default memo(WindowTitleBar);
