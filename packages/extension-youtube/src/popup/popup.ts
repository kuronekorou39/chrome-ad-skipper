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

let currentTabId: number | null = null;

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
    section.appendChild(createToggleRow('自動スキップ', data.ytAutoSkip, (v) => {
      chrome.storage.local.set({ ytAutoSkip: v });
    }));
    tabSettings.appendChild(section);

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

function createSliderRow(label: string, value: number, onChange: (v: number) => void, opts?: { min?: number; max?: number; step?: number; unit?: string }): HTMLDivElement {
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

function renderYouTubeStatus(data: {
  url: string;
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
  connectionEl.innerHTML = `<span class="dot ${dotClass}"></span>YouTube`;

  const stateLabel = youtube.isAdPlaying ? '広告スキップ待ち' : '監視中';
  const stateClass = youtube.isAdPlaying ? 'val--ad' : 'val--idle';

  statusPanel.innerHTML = `
    <div class="status-row">
      <span class="label">ステータス</span>
      <span class="${stateClass}">${stateLabel}</span>
    </div>
    <div class="status-row">
      <span class="label">スキップ回数</span>
      <span>${youtube.adSkipCount}</span>
    </div>
    <div class="status-row">
      <span class="label">自動スキップ</span>
      <span>
        <button id="toggle-skip" class="toggle-btn ${youtube.autoSkipEnabled ? 'on' : 'off'}">
          ${youtube.autoSkipEnabled ? 'ON' : 'OFF'}
        </button>
      </span>
    </div>
  `;

  document.getElementById('toggle-skip')?.addEventListener('click', () => {
    if (currentTabId === null) return;
    chrome.tabs.sendMessage(currentTabId, {
      type: 'set-auto-skip',
      enabled: !youtube.autoSkipEnabled,
    });
  });

  const ytLogs: TaggedLog[] = youtube.eventLog
    .map((entry) => ({ tag: 'YT', cssClass: 'log-tag--yt', entry }))
    .sort((a, b) => a.entry.localeCompare(b.entry))
    .reverse();
  renderLogEntries(ytLogs);
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

    if (!tab.url.includes('youtube.com')) {
      renderDisconnected('YouTubeを開いてください');
      return;
    }

    currentTabId = tab.id;

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
