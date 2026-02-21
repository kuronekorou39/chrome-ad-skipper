const connectionEl = document.getElementById('connection')!;
const statusPanel = document.getElementById('status-panel')!;
const logEl = document.getElementById('log')!;

type Site = 'twitch' | 'prime' | 'other';

function detectSite(url: string): Site {
  if (url.includes('twitch.tv')) return 'twitch';
  if (url.includes('amazon.co') || url.includes('amazon.com') || url.includes('primevideo.com')) return 'prime';
  return 'other';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderDisconnected(reason: string): void {
  connectionEl.innerHTML = `<span class="dot dot--red"></span>${reason}`;
  statusPanel.textContent = '';
  logEl.textContent = '';
}

// ── Twitch ──

function renderTwitchStatus(data: {
  url: string;
  connected: boolean;
  swap: { state: string; videoCount: number; swapCount: number; log: string[] };
  points?: { claimCount: number; log: string[] };
  vodAd?: { skippedCount: number; log: string[] };
}): void {
  const isSwapping = data.swap.state === 'swapping';

  const dotClass = isSwapping ? 'dot--yellow' : 'dot--green';
  const channel = data.url.match(/twitch\.tv\/(\w+)/)?.[1] ?? data.url;
  connectionEl.innerHTML = `<span class="dot ${dotClass}"></span>Twitch: ${channel}`;

  const stateLabel = isSwapping ? '広告スワップ中' : '監視中';
  const stateClass = isSwapping ? 'val--swap' : 'val--idle';
  const pointsClaimed = data.points?.claimCount ?? 0;
  const vodAdsSkipped = data.vodAd?.skippedCount ?? 0;
  statusPanel.innerHTML = `
    <div class="status-row">
      <span class="label">ステータス</span>
      <span class="${stateClass}">${stateLabel}</span>
    </div>
    <div class="status-row">
      <span class="label">ビデオ数</span>
      <span>${data.swap.videoCount}</span>
    </div>
    <div class="status-row">
      <span class="label">広告スワップ (ライブ)</span>
      <span>${data.swap.swapCount}</span>
    </div>
    <div class="status-row">
      <span class="label">広告スキップ (VOD)</span>
      <span>${vodAdsSkipped}</span>
    </div>
    <div class="status-row">
      <span class="label">ポイント取得</span>
      <span>${pointsClaimed}</span>
    </div>
  `;

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

// ── Prime Video ──

let currentTabId: number | null = null;

function renderPrimeStatus(data: {
  url: string;
  connected: boolean;
  prime: {
    adSkipCount: number;
    isAdPlaying: boolean;
    autoSkipEnabled: boolean;
    eventLog: string[];
  };
}): void {
  const { prime } = data;
  const dotClass = prime.isAdPlaying ? 'dot--yellow' : 'dot--blue';
  connectionEl.innerHTML = `<span class="dot ${dotClass}"></span>Prime Video`;

  const stateLabel = prime.isAdPlaying ? '広告スキップ中 (16x)' : '本編再生中';
  const stateClass = prime.isAdPlaying ? 'val--ad' : 'val--idle';

  statusPanel.innerHTML = `
    <div class="status-row">
      <span class="label">ステータス</span>
      <span class="${stateClass}">${stateLabel}</span>
    </div>
    <div class="status-row">
      <span class="label">広告スキップ数</span>
      <span>${prime.adSkipCount}</span>
    </div>
    <div class="status-row">
      <span class="label">自動スキップ</span>
      <span>
        <button id="toggle-skip" class="toggle-btn ${prime.autoSkipEnabled ? 'on' : 'off'}">
          ${prime.autoSkipEnabled ? 'ON' : 'OFF'}
        </button>
      </span>
    </div>
  `;

  // Attach toggle handler
  document.getElementById('toggle-skip')?.addEventListener('click', () => {
    if (currentTabId === null) return;
    chrome.tabs.sendMessage(currentTabId, {
      type: 'set-auto-skip',
      enabled: !prime.autoSkipEnabled,
    });
  });

  if (prime.eventLog.length > 0) {
    logEl.innerHTML = [...prime.eventLog]
      .reverse()
      .map((entry) => `<div class="log-entry">${escapeHtml(entry)}</div>`)
      .join('');
  } else {
    logEl.textContent = '';
  }
}

// ── Polling ──

function poll(): void {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id || !tab.url) {
      renderDisconnected('アクティブなタブなし');
      return;
    }

    const site = detectSite(tab.url);
    currentTabId = tab.id;

    if (site === 'twitch') {
      chrome.tabs.sendMessage(tab.id, { type: 'get-swap-status' }, (response) => {
        if (chrome.runtime.lastError || !response) {
          renderDisconnected('未接続 (Twitch)');
          return;
        }
        renderTwitchStatus(response);
      });
    } else if (site === 'prime') {
      chrome.tabs.sendMessage(tab.id, { type: 'get-prime-status' }, (response) => {
        if (chrome.runtime.lastError || !response) {
          renderDisconnected('未接続 (Prime Video)');
          return;
        }
        renderPrimeStatus(response);
      });
    } else {
      renderDisconnected('Twitch / Prime Video を開いてください');
    }
  });
}

poll();
const interval = setInterval(poll, 1000);
window.addEventListener('unload', () => clearInterval(interval));
