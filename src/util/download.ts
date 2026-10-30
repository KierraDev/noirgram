import { IS_TAURI } from './browser/globalEnvironment';
import { pause } from './schedulers';

type PendingDownload = {
  url: string;
  filename: string;
  shouldAskPath?: boolean;
};

// Chrome prevents more than 10 downloads per second
const LIMIT_PER_BATCH = 10;
const BATCH_INTERVAL = 1000;

let pendingDownloads: PendingDownload[] = [];
let planned = false;

// `shouldAskPath` shows the "Save as" dialog in the desktop app even when it saves silently
export default function download(url: string, filename: string, shouldAskPath?: boolean) {
  pendingDownloads.push({ url, filename, shouldAskPath });
  if (!planned) {
    planned = true;
    setTimeout(async () => {
      await processQueue();
      planned = false;
    }, BATCH_INTERVAL);
  }
}

async function processQueue() {
  let count = 0;
  for (const pendingDownload of pendingDownloads) {
    await downloadOne(pendingDownload);
    count++;
    if (count === LIMIT_PER_BATCH) {
      await pause(BATCH_INTERVAL);
      count = 0;
    }
  }
  pendingDownloads = [];
}

async function downloadOne({ url, filename, shouldAskPath }: PendingDownload) {
  // The desktop app may show a "Save as" dialog first; the download is skipped when it is cancelled
  if (IS_TAURI && !await prepareTauriDownload(url, filename, shouldAskPath)) return;

  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.download = filename;
  try {
    link.click();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err); // Suppress redundant "Blob loading failed" error popup on IOS
  }
}

async function prepareTauriDownload(url: string, filename: string, shouldAskPath?: boolean) {
  try {
    return await window.tauri.prepareDownload(new URL(url, window.location.href).href, filename, shouldAskPath);
  } catch {
    return true;
  }
}
