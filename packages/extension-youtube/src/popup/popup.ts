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
  ytAutoSkip: boolean;
  overlayOpacity: number;
}

const DEFAULTS: SettingsData = {
  ytAutoSkip: true,
  overlayOpacity: 85,
};

function renderSettingsTab(): void {
  chrome.storage.local.get(Object.keys(DEFAULTS), (raw) => {
    const data: SettingsData = { ...DEFAULTS, ...raw };
    tabSettings.innerHTML = '';

    const section = createSection('YouTube');
    section.appendChild(
      createToggleRow('自動スキップ', 'スキップボタンの自動クリック・広告シーク', data.ytAutoSkip, (v) =>
        chrome.storage.local.set({ ytAutoSkip: v }),
      ),
    );
    tabSettings.appendChild(section);

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

function renderYouTubeStatus(data: {
  url: string;
  title?: string;
  connected: boolean;
  youtube: {
    adSkipCount: number;
    isAdPlaying: boolean;
    autoSkipEnabled: boolean;
    eventLog: string[];
  };
}): void {
  const { youtube } = data;
  const dotClass = youtube.isAdPlaying ? 'dot--yellow' : 'dot--green';
  const title = (data.title ?? '').replace(/\s*-\s*YouTube\s*$/, '') || 'YouTube';
  connectionEl.innerHTML = `<span class="dot ${dotClass}"></span>${escapeHtml(title)}`;

  const stateLabel = youtube.isAdPlaying ? '広告スキップ待ち' : '監視中';
  const badgeClass = youtube.isAdPlaying ? 'status-badge--active' : 'status-badge--idle';

  statusPanel.innerHTML = `
    <div class="status-badge ${badgeClass}">${stateLabel}</div>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${youtube.adSkipCount}</div>
        <div class="stat-label">広告スキップ</div>
      </div>
    </div>
  `;

  currentLogs = youtube.eventLog
    .map((entry) => ({ tag: 'YT', cssClass: 'log-tag--yt', entry }))
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

    if (!tab.url.includes('youtube.com')) {
      renderDisconnected('YouTubeを開いてください');
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: 'get-youtube-status' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        renderDisconnected('未接続 (YouTube)');
        return;
      }
      renderYouTubeStatus(response);
    });
  });
}

poll();
const interval = setInterval(poll, 1000);
window.addEventListener('unload', () => clearInterval(interval));
