const connectionEl = document.getElementById('connection')!;
const statusPanel = document.getElementById('status-panel')!;
const logEl = document.getElementById('log')!;
const logCopyBtn = document.getElementById('log-copy')!;
const versionEl = document.getElementById('version')!;
const tabStatus = document.getElementById('tab-status')!;
const tabLog = document.getElementById('tab-log')!;
const tabSettings = document.getElementById('tab-settings')!;

const TAB_ELEMENTS: Record<string, HTMLElement> = {
  status: tabStatus,
  log: tabLog,
  settings: tabSettings,
};

// Show extension version
const manifest = chrome.runtime.getManifest();
versionEl.textContent = `v${manifest.version}`;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderDisconnected(reason: string): void {
  connectionEl.innerHTML = `<span class="dot dot--red"></span>${escapeHtml(reason)}`;
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

    // Ad handling section
    const adSection = createSection('広告対策');
    adSection.appendChild(createToggleRow(
      '広告スワップ', '広告中にサブストリームに自動切替',
      data.streamSwapEnabled, (v) => chrome.storage.local.set({ streamSwapEnabled: v }),
    ));
    adSection.appendChild(createToggleRow(
      'VOD広告スキップ', 'VODの広告を倍速+ミュートで早送り',
      data.vodAdSkipEnabled, (v) => chrome.storage.local.set({ vodAdSkipEnabled: v }),
    ));
    adSection.appendChild(createToggleRow(
      'ライブ広告ミュート', 'スワップ不可時に広告をミュート+倍速',
      data.liveAdMuteEnabled, (v) => chrome.storage.local.set({ liveAdMuteEnabled: v }),
    ));
    adSection.appendChild(createSliderRow(
      '広告早送り速度', 'VOD・ライブ広告の再生速度',
      data.adPlaybackRate, (v) => chrome.storage.local.set({ adPlaybackRate: v }),
      { min: 2, max: 16, step: 2, unit: 'x' },
    ));
    tabSettings.appendChild(adSection);

    // Utility section
    const utilSection = createSection('ユーティリティ');
    utilSection.appendChild(createToggleRow(
      'ポイント自動取得', 'チャンネルポイントボタンを自動クリック',
      data.autoPointsEnabled, (v) => chrome.storage.local.set({ autoPointsEnabled: v }),
    ));
    utilSection.appendChild(createToggleRow(
      'チャット維持', '折り畳み時もチャットを維持しスワップを有効化',
      data.chatKeeperEnabled, (v) => chrome.storage.local.set({ chatKeeperEnabled: v }),
    ));
    tabSettings.appendChild(utilSection);

    // Display section
    const displaySection = createSection('表示');
    displaySection.appendChild(createSliderRow(
      'オーバーレイ不透明度', '広告スキップ中の暗転の濃さ',
      data.overlayOpacity, (v) => chrome.storage.local.set({ overlayOpacity: v }),
    ));
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

function createToggleRow(label: string, desc: string, checked: boolean, onChange: (v: boolean) => void): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'setting-row';

  const info = document.createElement('div');
  info.className = 'setting-info';
  const labelEl = document.createElement('span');
  labelEl.className = 'setting-label';
  labelEl.textContent = label;
  const descEl = document.createElement('span');
  descEl.className = 'setting-desc';
  descEl.textContent = desc;
  info.appendChild(labelEl);
  info.appendChild(descEl);

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

  row.appendChild(info);
  row.appendChild(toggle);
  return row;
}

interface SliderOptions {
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

function createSliderRow(label: string, desc: string, value: number, onChange: (v: number) => void, opts?: SliderOptions): HTMLDivElement {
  const min = opts?.min ?? 0;
  const max = opts?.max ?? 100;
  const step = opts?.step ?? 1;
  const unit = opts?.unit ?? '%';

  const row = document.createElement('div');
  row.className = 'setting-row';

  const info = document.createElement('div');
  info.className = 'setting-info';
  const labelEl = document.createElement('span');
  labelEl.className = 'setting-label';
  labelEl.textContent = label;
  const descEl = document.createElement('span');
  descEl.className = 'setting-desc';
  descEl.textContent = desc;
  info.appendChild(labelEl);
  info.appendChild(descEl);

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
  row.appendChild(info);
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
  const isActive = isSwapping || isLiveAdMuting;

  const dotClass = isActive ? 'dot--yellow' : 'dot--green';
  const channel = data.url.match(/twitch\.tv\/(\w+)/)?.[1] ?? data.url;
  connectionEl.innerHTML = `<span class="dot ${dotClass}"></span>${escapeHtml(channel)}`;

  const stateLabel = isSwapping ? '広告スワップ中' : isLiveAdMuting ? '広告ミュート中' : '監視中';
  const badgeClass = isActive ? 'status-badge--active' : 'status-badge--idle';
  const pointsClaimed = data.points?.claimCount ?? 0;
  const vodAdsSkipped = data.vodAd?.skippedCount ?? 0;
  const liveAdsMuted = data.liveAd?.skippedCount ?? 0;

  statusPanel.innerHTML = `
    <div class="status-badge ${badgeClass}">${stateLabel}</div>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${data.swap.swapCount}</div>
        <div class="stat-label">広告スワップ</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${liveAdsMuted}</div>
        <div class="stat-label">広告ミュート</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${vodAdsSkipped}</div>
        <div class="stat-label">VODスキップ</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${pointsClaimed}</div>
        <div class="stat-label">ポイント取得</div>
      </div>
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

/** Currently displayed logs — kept for copy */
let currentLogs: TaggedLog[] = [];

function renderLogEntries(logs: TaggedLog[]): void {
  currentLogs = logs;

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

// ── Copy logs ──

logCopyBtn.addEventListener('click', () => {
  if (currentLogs.length === 0) return;

  const text = currentLogs
    .map(({ tag, entry }) => `[${tag}] ${entry}`)
    .join('\n');

  const originalHTML = logCopyBtn.innerHTML;
  navigator.clipboard.writeText(text).then(() => {
    logCopyBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> OK';
    logCopyBtn.classList.add('copied');
    setTimeout(() => {
      logCopyBtn.innerHTML = originalHTML;
      logCopyBtn.classList.remove('copied');
    }, 1500);
  });
});

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
