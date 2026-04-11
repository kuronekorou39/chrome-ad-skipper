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

let currentTabId: number | null = null;

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
    section.appendChild(createToggleRow(
      '自動スキップ', '広告を自動で倍速+ミュートして早送り',
      data.pvAutoSkip, (v) => chrome.storage.local.set({ pvAutoSkip: v }),
    ));
    tabSettings.appendChild(section);

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

function createSliderRow(label: string, desc: string, value: number, onChange: (v: number) => void, opts?: { min?: number; max?: number; step?: number; unit?: string }): HTMLDivElement {
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

function renderPrimeStatus(data: {
  url: string;
  title: string;
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
  const title = (data.title ?? '')
    .replace(/^Amazon\.co\.jp:\s*/, '')
    .replace(/^Amazon\.com:\s*/, '')
    .replace(/\s*-\s*Prime Video\s*$/, '')
    || 'Prime Video';
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

  const primeLogs: TaggedLog[] = prime.eventLog
    .map((entry) => ({ tag: 'PV', cssClass: 'log-tag--pv', entry }))
    .sort((a, b) => a.entry.localeCompare(b.entry))
    .reverse();
  renderLogEntries(primeLogs);
}

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

    const url = tab.url;
    const isPrime =
      url.includes('amazon.co') ||
      url.includes('amazon.com') ||
      url.includes('primevideo.com');

    if (!isPrime) {
      renderDisconnected('Prime Videoを開いてください');
      return;
    }

    currentTabId = tab.id;

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
