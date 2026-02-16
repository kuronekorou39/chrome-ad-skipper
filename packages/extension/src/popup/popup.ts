const connectionEl = document.getElementById('connection')!;
const swapStatusEl = document.getElementById('swap-status')!;
const logEl = document.getElementById('log')!;

function renderDisconnected(reason: string): void {
  connectionEl.innerHTML = `<span class="dot dot--red"></span>${reason}`;
  swapStatusEl.textContent = '';
  logEl.textContent = '';
}

function renderStatus(data: {
  url: string;
  connected: boolean;
  swap: { state: string; videoCount: number; swapCount: number; log: string[] };
  points?: { claimCount: number; log: string[] };
  vodAd?: { skippedCount: number; log: string[] };
}): void {
  const isSwapping = data.swap.state === 'swapping';

  // Connection
  const dotClass = isSwapping ? 'dot--yellow' : 'dot--green';
  const channel = data.url.match(/twitch\.tv\/(\w+)/)?.[1] ?? data.url;
  connectionEl.innerHTML = `<span class="dot ${dotClass}"></span>${channel}`;

  // Status
  const stateLabel = isSwapping ? 'Ad Swap Active' : 'Monitoring';
  const stateClass = isSwapping ? 'val--swap' : 'val--idle';
  const pointsClaimed = data.points?.claimCount ?? 0;
  const vodAdsSkipped = data.vodAd?.skippedCount ?? 0;
  swapStatusEl.innerHTML = `
    <div class="status-row">
      <span class="label">Status</span>
      <span class="${stateClass}">${stateLabel}</span>
    </div>
    <div class="status-row">
      <span class="label">Videos</span>
      <span>${data.swap.videoCount}</span>
    </div>
    <div class="status-row">
      <span class="label">Ad Swaps (Live)</span>
      <span>${data.swap.swapCount}</span>
    </div>
    <div class="status-row">
      <span class="label">Ads Skipped (VOD)</span>
      <span>${vodAdsSkipped}</span>
    </div>
    <div class="status-row">
      <span class="label">Points Claimed</span>
      <span>${pointsClaimed}</span>
    </div>
  `;

  // Log (merge swap + points logs, sort newest first)
  const allLogs = [
    ...data.swap.log,
    ...(data.points?.log ?? []),
    ...(data.vodAd?.log ?? []),
  ].sort().reverse();

  if (allLogs.length > 0) {
    logEl.innerHTML = allLogs
      .map((entry) => `<div class="log-entry">${escapeHtml(entry)}</div>`)
      .join('');
  } else {
    logEl.textContent = '';
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function poll(): void {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id || !tab.url?.includes('twitch.tv')) {
      renderDisconnected('Not on a Twitch page');
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: 'get-swap-status' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        renderDisconnected('Content script not loaded');
        return;
      }
      renderStatus(response);
    });
  });
}

// Initial + 1s polling
poll();
const interval = setInterval(poll, 1000);
window.addEventListener('unload', () => clearInterval(interval));
