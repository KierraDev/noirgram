import { memo, useEffect, useRef, useState } from '../../lib/teact/teact';
import { getGlobal } from '../../global';

import type { ExportProgress } from '../../util/noirgram/exportChatHistory';

import { getPeerTitle } from '../../global/helpers/peers';
import { selectChat } from '../../global/selectors';
import download from '../../util/download';
import { getTranslationFn } from '../../util/localization';
import { buildChatHistoryHtml, getExportFilename, loadChatHistory } from '../../util/noirgram/exportChatHistory';
import { createSignal } from '../../util/signals';

import useDerivedState from '../../hooks/useDerivedState';
import useLang from '../../hooks/useLang';
import useLastCallback from '../../hooks/useLastCallback';

import Button from '../ui/Button';
import Modal from '../ui/Modal';

import styles from './ExportChatModal.module.scss';

type Status = 'loading' | 'saving' | 'done' | 'error';

const [getExportChatId, setExportChatId] = createSignal<string | undefined>();

export function openExportChatModal(chatId: string) {
  setExportChatId(chatId);
}

// Progress of "Export chat history" (chat header menu). Loading runs while the modal is open and
// stops when it is closed.
const ExportChatModal = () => {
  const lang = useLang();
  const chatId = useDerivedState(getExportChatId);
  const [status, setStatus] = useState<Status>('loading');
  const [progress, setProgress] = useState<ExportProgress>({ loaded: 0 });
  const abortControllerRef = useRef<AbortController>();

  const chat = chatId ? selectChat(getGlobal(), chatId) : undefined;

  useEffect(() => {
    if (!chatId) return undefined;

    const currentChat = selectChat(getGlobal(), chatId);
    if (!currentChat) return undefined;

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setStatus('loading');
    setProgress({ loaded: 0 });

    void (async () => {
      try {
        const history = await loadChatHistory(currentChat, setProgress, abortController.signal);
        if (abortController.signal.aborted) return;

        setStatus('saving');
        const exportLang = getTranslationFn();
        const html = buildChatHistoryHtml(exportLang, currentChat, history);
        const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
        // Always asks where to save, like the export of Telegram Desktop
        download(url, getExportFilename(exportLang, currentChat), true);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        if (!abortController.signal.aborted) setStatus('done');
      } catch {
        if (!abortController.signal.aborted) setStatus('error');
      }
    })();

    return () => {
      abortController.abort();
    };
  }, [chatId]);

  const handleClose = useLastCallback(() => {
    abortControllerRef.current?.abort();
    setExportChatId(undefined);
  });

  const percent = progress.total ? Math.min(100, Math.round((progress.loaded / progress.total) * 100)) : 0;

  function renderStatus() {
    switch (status) {
      case 'loading':
        return lang('NoirgramExportLoading', {
          loaded: lang.number(progress.loaded),
          total: lang.number(progress.total ?? 0),
        });
      case 'saving':
        return lang('NoirgramExportSaving');
      case 'done':
        return lang('NoirgramExportDone', { count: lang.number(progress.loaded) });
      case 'error':
        return lang('NoirgramExportError');
    }
  }

  return (
    <Modal
      isOpen={Boolean(chatId && chat)}
      title={lang('NoirgramExportTitle')}
      hasCloseButton
      onClose={handleClose}
    >
      <div className={styles.root}>
        <p className={styles.chat}>{chat ? getPeerTitle(lang, chat) : ''}</p>
        <div
          className={styles.track}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={status === 'loading' ? percent : 100}
        >
          <div
            className={styles.fill}
            style={`transform: scaleX(${status === 'loading' ? percent / 100 : 1})`}
          />
        </div>
        <p className={styles.status} aria-live="polite">{renderStatus()}</p>
        <p className={styles.hint}>{lang('NoirgramExportHint')}</p>
        <div className={styles.actions}>
          <Button
            color={status === 'loading' ? 'secondary' : 'primary'}
            noForcedUpperCase
            onClick={handleClose}
          >
            {lang(status === 'loading' || status === 'saving' ? 'Cancel' : 'Close')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default memo(ExportChatModal);
