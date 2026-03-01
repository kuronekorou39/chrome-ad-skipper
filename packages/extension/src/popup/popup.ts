const connectionEl = document.getElementById('connection')!;
const statusPanel = document.getElementById('status-panel')!;
const logEl = document.getElementById('log')!;
const tabStatus = document.getElementById('tab-status')!;
const tabSettings = document.getElementById('tab-settings')!;

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

// ── Tab switching ──

document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    const tab = btn.dataset.tab;
    if (tab === 'status') {
      tabStatus.classList.remove('hidden');
      tabSettings.classList.add('hidden');
    } else {
      tabStatus.classList.add('hidden');
      tabSettings.classList.remove('hidden');
      renderSettingsTab();
    }
  });
});

// ── Settings ──

interface SettingsData {
  streamSwapEnabled: boolean;
  vodAdSkipEnabled: boolean;
  autoPointsEnabled: boolean;
  chatKeeperEnabled: boolean;
  pvAutoSkip: boolean;
  overlayOpacity: number;
}

const DEFAULTS: SettingsData = {
  streamSwapEnabled: true,
  vodAdSkipEnabled: true,
  autoPointsEnabled: true,
  chatKeeperEnabled: true,
  pvAutoSkip: true,
  overlayOpacity: 85,
};

function renderSettingsTab(): void {
  chrome.storage.local.get(Object.keys(DEFAULTS), (raw) => {
    const data: SettingsData = { ...DEFAULTS, ...raw };
    tabSettings.innerHTML = '';

    // Twitch section
    const twitchSection = createSection('Twitch');
    twitchSection.appendChild(createToggleRow('広告スワップ (ライブ)', data.streamSwapEnabled, (v) => {
      chrome.storage.local.set({ streamSwapEnabled: v });
    }));
    twitchSection.appendChild(createToggleRow('VOD広告スキップ', data.vodAdSkipEnabled, (v) => {
      chrome.storage.local.set({ vodAdSkipEnabled: v });
    }));
    twitchSection.appendChild(createToggleRow('ポイント自動取得', data.autoPointsEnabled, (v) => {
      chrome.storage.local.set({ autoPointsEnabled: v });
    }));
    twitchSection.appendChild(createToggleRow('チャット維持', data.chatKeeperEnabled, (v) => {
      chrome.storage.local.set({ chatKeeperEnabled: v });
    }));
    tabSettings.appendChild(twitchSection);

    // Prime Video section
    const primeSection = createSection('Prime Video');
    primeSection.appendChild(createToggleRow('自動スキップ', data.pvAutoSkip, (v) => {
      chrome.storage.local.set({ pvAutoSkip: v });
    }));
    tabSettings.appendChild(primeSection);

    // Display section
    const displaySection = createSection('表示');
    displaySection.appendChild(createSliderRow('オーバーレイ不透明度', data.overlayOpacity, (v) => {
      chrome.storage.local.set({ overlayOpacity: v });
    }));
    tabSettings.appendChild(displaySection);
  });
}

function createSection(title: string): HTMLDivElement {
  const section = document.createElement('div');
  section.className = 'settings-section';
  const heading = document.createElement('div');
  heading.className = 'settings-section-title';
  heading.textContent = title;
  section.appendChild(heading);
  return section;
}

function createToggleRow(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'setting-row';

  const labelEl = document.createElement('span');
  labelEl.className = 'setting-label';
  labelEl.textContent = label;

  const toggle = document.createElement('label');
  toggle.className = 'toggle-switch';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));

  const slider = document.createElement('span');
  slider.className = 'slider';

  toggle.appendChild(input);
  toggle.appendChild(slider);
  row.appendChild(labelEl);
  row.appendChild(toggle);
  return row;
}

function createSliderRow(label: string, value: number, onChange: (v: number) => void): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'setting-row';

  const labelEl = document.createElement('span');
  labelEl.className = 'setting-label';
  labelEl.textContent = label;

  const control = document.createElement('div');
  control.className = 'opacity-control';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'opacity-slider';
  slider.min = '0';
  slider.max = '100';
  slider.value = String(value);

  const valueEl = document.createElement('span');
  valueEl.className = 'opacity-value';
  valueEl.textContent = `${value}%`;

  slider.addEventListener('input', () => {
    valueEl.textContent = `${slider.value}%`;
  });
  slider.addEventListener('change', () => {
    onChange(Number(slider.value));
  });

  control.appendChild(slider);
  control.appendChild(valueEl);
  row.appendChild(labelEl);
  row.appendChild(control);
  return row;
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
