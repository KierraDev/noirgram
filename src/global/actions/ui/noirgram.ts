import type { ActionReturnType } from '../../types';

import { getCurrentTabId } from '../../../util/establishMultitabRole';
import { addActionHandler } from '../../index';
import { updateSharedSettings } from '../../reducers';
import { updateTabState } from '../../reducers/tabs';
import { selectTabState } from '../../selectors';
import { selectNoirgramSettings } from '../../selectors/sharedState';

addActionHandler('updateNoirgramSettings', (global, actions, payload): ActionReturnType => {
  global = updateSharedSettings(global, {
    noirgram: {
      ...selectNoirgramSettings(global),
      ...payload,
    },
  });

  if (payload.shouldHideStories) {
    const tabId = getCurrentTabId();
    global = updateTabState(global, {
      storyViewer: {
        ...selectTabState(global, tabId).storyViewer,
        isRibbonShown: false,
        isArchivedRibbonShown: false,
      },
    }, tabId);
  }

  return global;
});

addActionHandler('revealDownloadedFile', (global, actions, payload): ActionReturnType => {
  void window.tauri?.revealDownload(payload.path).catch(() => {
    actions.openDownloadsFolder();
  });
});

addActionHandler('openDownloadsFolder', (): ActionReturnType => {
  void window.tauri?.openDownloadsFolder();
});
