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
  pvAutoSkip: boolean;
  overlayOpacity: number;
}

const DEFAULTS: SettingsData = {
  pvAutoSkip: true,
  overlayOpacity: 85,
};

function renderSettingsTab(): void {
  chrome.storage.local.get(Object.keys(DEFAULTS), (raw) => {
    const data: SettingsData = { ...DEFAULTS, ...raw };
    tabSettings.innerHTML = '';

    const section = createSection('Prime Video');
    section.appendChild(
      createToggleRow('自動スキップ', '広告を自動で倍速+ミュートして早送り', data.pvAutoSkip, (v) =>
        chrome.storage.local.set({ pvAutoSkip: v }),
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

function renderPrimeStatus(data: {
  url: string;
  title?: string;
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
  const title =
    (data.title ?? '')
      .replace(/^Amazon\.co\.jp:\s*/, '')
      .replace(/^Amazon\.com:\s*/, '')
      .replace(/\s*-\s*Prime Video\s*$/, '') || 'Prime Video';
  connectionEl.innerHTML = `<span class="dot ${dotClass}"></span>${escapeHtml(title)}`;

  const stateLabel = prime.isAdPlaying ? '広告スキップ中 (16x)' : '本編再生中';
  const badgeClass = prime.isAdPlaying ? 'status-badge--active' : 'status-badge--idle';

  statusPanel.innerHTML = `
    <div class="status-badge ${badgeClass}">${stateLabel}</div>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${prime.adSkipCount}</div>
        <div class="stat-label">広告スキップ</div>
      </div>
    </div>
  `;

  currentLogs = prime.eventLog
    .map((entry) => ({ tag: 'PV', cssClass: 'log-tag--pv', entry }))
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

    const url = tab.url;
    const isPrime = url.includes('amazon.co') || url.includes('amazon.com') || url.includes('primevideo.com');

    if (!isPrime) {
      renderDisconnected('Prime Videoを開いてください');
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: 'get-prime-status' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        renderDisconnected('未接続 (Prime Video)');
        return;
      }
      renderPrimeStatus(response);
    });
  });
}

poll();
const interval = setInterval(poll, 1000);
window.addEventListener('unload', () => clearInterval(interval));
