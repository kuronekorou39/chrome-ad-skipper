const connectionEl = document.getElementById('connection')!;
const statusPanel = document.getElementById('status-panel')!;
const logEl = document.getElementById('log')!;
const tabStatus = document.getElementById('tab-status')!;
const tabLog = document.getElementById('tab-log')!;
const tabSettings = document.getElementById('tab-settings')!;

const TAB_ELEMENTS: Record<string, HTMLElement> = {
  status: tabStatus,
  log: tabLog,
  settings: tabSettings,
};

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

    const tab = btn.dataset.tab ?? 'status';
    for (const [key, el] of Object.entries(TAB_ELEMENTS)) {
      el.classList.toggle('hidden', key !== tab);
    }
    if (tab === 'settings') renderSettingsTab();
  });
});

// ── Settings ──

interface SettingsData {
  streamSwapEnabled: boolean;
  vodAdSkipEnabled: boolean;
  autoPointsEnabled: boolean;
  chatKeeperEnabled: boolean;
  liveAdMuteEnabled: boolean;
  adPlaybackRate: number;
  overlayOpacity: number;
}

const DEFAULTS: SettingsData = {
  streamSwapEnabled: true,
  vodAdSkipEnabled: true,
  autoPointsEnabled: true,
  chatKeeperEnabled: true,
  liveAdMuteEnabled: true,
  adPlaybackRate: 16,
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
    twitchSection.appendChild(createToggleRow('ライブ広告ミュート', data.liveAdMuteEnabled, (v) => {
      chrome.storage.local.set({ liveAdMuteEnabled: v });
    }));
    twitchSection.appendChild(createSliderRow('広告早送り速度', data.adPlaybackRate, (v) => {
      chrome.storage.local.set({ adPlaybackRate: v });
    }, { min: 2, max: 16, step: 2, unit: 'x' }));
    tabSettings.appendChild(twitchSection);

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

interface SliderOptions {
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

function createSliderRow(label: string, value: number, onChange: (v: number) => void, opts?: SliderOptions): HTMLDivElement {
  const min = opts?.min ?? 0;
  const max = opts?.max ?? 100;
  const step = opts?.step ?? 1;
  const unit = opts?.unit ?? '%';

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
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.value = String(value);

  const valueEl = document.createElement('span');
  valueEl.className = 'opacity-value';
  valueEl.textContent = `${value}${unit}`;

  slider.addEventListener('input', () => {
    valueEl.textContent = `${slider.value}${unit}`;
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

// ── Status ──

interface TaggedLog {
  tag: string;
  cssClass: string;
  entry: string;
}

function tagLogs(entries: string[], tag: string, cssClass: string): TaggedLog[] {
  return entries.map((entry) => ({ tag, cssClass, entry }));
}

function renderTwitchStatus(data: {
  url: string;
  connected: boolean;
  swap: { state: string; videoCount: number; swapCount: number; log: string[] };
  points?: { claimCount: number; log: string[] };
  vodAd?: { skippedCount: number; log: string[] };
  liveAd?: { skippedCount: number; isAdPlaying: boolean; log: string[] };
  chat?: { log: string[] };
}): void {
  const isSwapping = data.swap.state === 'swapping';
  const isLiveAdMuting = data.liveAd?.isAdPlaying ?? false;

  const dotClass = (isSwapping || isLiveAdMuting) ? 'dot--yellow' : 'dot--green';
  const channel = data.url.match(/twitch\.tv\/(\w+)/)?.[1] ?? data.url;
  connectionEl.innerHTML = `<span class="dot ${dotClass}"></span>Twitch: ${channel}`;

  const stateLabel = isSwapping ? '広告スワップ中' : isLiveAdMuting ? '広告ミュート中' : '監視中';
  const stateClass = (isSwapping || isLiveAdMuting) ? 'val--swap' : 'val--idle';
  const pointsClaimed = data.points?.claimCount ?? 0;
  const vodAdsSkipped = data.vodAd?.skippedCount ?? 0;
  const liveAdsMuted = data.liveAd?.skippedCount ?? 0;
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
      <span class="label">広告ミュート (ライブ)</span>
      <span>${liveAdsMuted}</span>
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

  const allLogs: TaggedLog[] = [
    ...tagLogs(data.swap.log, 'SWAP', 'log-tag--swap'),
    ...tagLogs(data.points?.log ?? [], 'PTS', 'log-tag--pts'),
    ...tagLogs(data.vodAd?.log ?? [], 'VOD', 'log-tag--vod'),
    ...tagLogs(data.liveAd?.log ?? [], 'LIVE', 'log-tag--live'),
    ...tagLogs(data.chat?.log ?? [], 'CHAT', 'log-tag--chat'),
  ].sort((a, b) => a.entry.localeCompare(b.entry)).reverse();

  renderLogEntries(allLogs);
}

function renderLogEntries(logs: TaggedLog[]): void {
  if (logs.length > 0) {
    logEl.innerHTML = logs
      .map(({ tag, cssClass, entry }) => {
        const match = entry.match(/^(\[[^\]]+\])\s*(.*)/);
        if (match) {
          return `<div class="log-entry"><span class="log-time">${escapeHtml(match[1])}</span> <span class="log-tag ${cssClass}">${tag}</span> ${escapeHtml(match[2])}</div>`;
        }
        return `<div class="log-entry"><span class="log-tag ${cssClass}">${tag}</span> ${escapeHtml(entry)}</div>`;
      })
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

    if (!tab.url.includes('twitch.tv')) {
      renderDisconnected('Twitchを開いてください');
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: 'get-swap-status' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        renderDisconnected('未接続 (Twitch)');
        return;
      }
      renderTwitchStatus(response);
    });
  });
}

poll();
const interval = setInterval(poll, 1000);
window.addEventListener('unload', () => clearInterval(interval));
