/** Tagged log entry for display in the popup log tab. */
export interface TaggedLog {
  tag: string;
  cssClass: string;
  entry: string;
}

export interface SliderOptions {
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

/** Escape HTML special characters to prevent XSS. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Set up tab switching for the popup's tab bar. */
export function setupTabSwitching(
  tabElements: Record<string, HTMLElement>,
  onTabChange?: (tab: string) => void,
): void {
  document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const tab = btn.dataset.tab ?? 'status';
      for (const [key, el] of Object.entries(tabElements)) {
        el.classList.toggle('hidden', key !== tab);
      }
      onTabChange?.(tab);
    });
  });
}

/** Display the extension version from the manifest. */
export function showVersion(el: HTMLElement): void {
  const manifest = chrome.runtime.getManifest();
  el.textContent = `v${manifest.version}`;
}

/** Create a settings section with a title heading. */
export function createSection(title: string): HTMLDivElement {
  const section = document.createElement('div');
  section.className = 'settings-section';
  const heading = document.createElement('div');
  heading.className = 'settings-section-title';
  heading.textContent = title;
  section.appendChild(heading);
  return section;
}

/** Create a settings row with a label, description, and toggle switch. */
export function createToggleRow(
  label: string,
  desc: string,
  checked: boolean,
  onChange: (v: boolean) => void,
): HTMLDivElement {
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

/** Create a settings row with a label, description, and range slider. */
export function createSliderRow(
  label: string,
  desc: string,
  value: number,
  onChange: (v: number) => void,
  opts?: SliderOptions,
): HTMLDivElement {
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

/** Render tagged log entries into the log container. */
export function renderLogEntries(logEl: HTMLElement, logs: TaggedLog[]): void {
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

/** Set up the log copy button with clipboard support and visual feedback. */
export function setupLogCopy(
  copyBtn: HTMLElement,
  getLogs: () => TaggedLog[],
): void {
  copyBtn.addEventListener('click', () => {
    const logs = getLogs();
    if (logs.length === 0) return;

    const text = logs
      .map(({ tag, entry }) => `[${tag}] ${entry}`)
      .join('\n');

    const originalHTML = copyBtn.innerHTML;
    navigator.clipboard.writeText(text).then(() => {
      copyBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> OK';
      copyBtn.classList.add('copied');
      setTimeout(() => {
        copyBtn.innerHTML = originalHTML;
        copyBtn.classList.remove('copied');
      }, 1500);
    });
  });
}
