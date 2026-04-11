import {
  escapeHtml,
  setupTabSwitching,
  showVersion,
  createSection,
  createToggleRow,
  createSliderRow,
  renderLogEntries,
  setupLogCopy,
} from '@ad-skipper/shared';
import type { TaggedLog } from '@ad-skipper/shared';

const connectionEl = document.getElementById('connection')!;
const statusPanel = document.getElementById('status-panel')!;
const logEl = document.getElementById('log')!;
const tabSettings = document.getElementById('tab-settings')!;

showVersion(document.getElementById('version')!);

setupTabSwitching(
  {
    status: document.getElementById('tab-status')!,
    log: document.getElementById('tab-log')!,
    settings: tabSettings,
  },
  (tab) => {
    if (tab === 'settings') renderSettingsTab();
  },
);

let currentLogs: TaggedLog[] = [];
setupLogCopy(document.getElementById('log-copy')!, () => currentLogs);

function renderDisconnected(reason: string): void {
  connectionEl.innerHTML = `<span class="dot dot--red"></span>${escapeHtml(reason)}`;
  statusPanel.textContent = '';
  logEl.textContent = '';
}

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

    const adSection = createSection('広告対策');
    adSection.appendChild(
      createToggleRow('広告スワップ', '広告中にサブストリームに自動切替', data.streamSwapEnabled, (v) =>
        chrome.storage.local.set({ streamSwapEnabled: v }),
      ),
    );
    adSection.appendChild(
      createToggleRow('VOD広告スキップ', 'VODの広告を倍速+ミュートで早送り', data.vodAdSkipEnabled, (v) =>
        chrome.storage.local.set({ vodAdSkipEnabled: v }),
      ),
    );
    adSection.appendChild(
      createToggleRow('ライブ広告ミュート', 'スワップ不可時に広告をミュート+倍速', data.liveAdMuteEnabled, (v) =>
        chrome.storage.local.set({ liveAdMuteEnabled: v }),
      ),
    );
    adSection.appendChild(
      createSliderRow(
        '広告早送り速度',
        'VOD・ライブ広告の再生速度',
        data.adPlaybackRate,
        (v) => chrome.storage.local.set({ adPlaybackRate: v }),
        { min: 2, max: 16, step: 2, unit: 'x' },
      ),
    );
    tabSettings.appendChild(adSection);

    const utilSection = createSection('ユーティリティ');
    utilSection.appendChild(
      createToggleRow('ポイント自動取得', 'チャンネルポイントボタンを自動クリック', data.autoPointsEnabled, (v) =>
        chrome.storage.local.set({ autoPointsEnabled: v }),
      ),
    );
    utilSection.appendChild(
      createToggleRow('チャット維持', '折り畳み時もチャットを維持しスワップを有効化', data.chatKeeperEnabled, (v) =>
        chrome.storage.local.set({ chatKeeperEnabled: v }),
      ),
    );
    tabSettings.appendChild(utilSection);

    const displaySection = createSection('表示');
    displaySection.appendChild(
      createSliderRow('オーバーレイ不透明度', '広告スキップ中の暗転の濃さ', data.overlayOpacity, (v) =>
        chrome.storage.local.set({ overlayOpacity: v }),
      ),
    );
    tabSettings.appendChild(displaySection);
  });
}

// ── Status ──

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

  currentLogs = [
    ...tagLogs(data.swap.log, 'SWAP', 'log-tag--swap'),
    ...tagLogs(data.points?.log ?? [], 'PTS', 'log-tag--pts'),
    ...tagLogs(data.vodAd?.log ?? [], 'VOD', 'log-tag--vod'),
    ...tagLogs(data.liveAd?.log ?? [], 'LIVE', 'log-tag--live'),
    ...tagLogs(data.chat?.log ?? [], 'CHAT', 'log-tag--chat'),
  ]
    .sort((a, b) => a.entry.localeCompare(b.entry))
    .reverse();

  renderLogEntries(logEl, currentLogs);
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
