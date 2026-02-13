import type { NetworkLogEntry } from '@twitch-swap/shared';

/**
 * Table showing all captured HLS network requests.
 */
export class NetworkLog {
  private tbody: HTMLTableSectionElement;
  private autoScroll = true;

  constructor(tableId: string) {
    const table = document.getElementById(tableId) as HTMLTableElement;
    this.tbody = table.querySelector('tbody')!;

    // Disable auto-scroll when user scrolls up
    const container = table.parentElement!;
    container.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      this.autoScroll = scrollHeight - scrollTop - clientHeight < 50;
    });
  }

  addEntry(entry: NetworkLogEntry): void {
    const tr = this.createRow(entry);
    this.tbody.appendChild(tr);

    if (this.autoScroll) {
      this.tbody.parentElement?.parentElement?.scrollTo(0, 999999);
    }
  }

  setEntries(entries: NetworkLogEntry[]): void {
    this.tbody.innerHTML = '';
    for (const entry of entries) {
      this.tbody.appendChild(this.createRow(entry));
    }
  }

  clear(): void {
    this.tbody.innerHTML = '';
  }

  private createRow(entry: NetworkLogEntry): HTMLTableRowElement {
    const tr = document.createElement('tr');
    if (entry.isAd) tr.classList.add('ad');

    const typeColor = this.getTypeColor(entry.type);
    const statusColor = entry.statusCode >= 400 ? '#e74c3c' : entry.statusCode >= 300 ? '#f39c12' : '#2ecc71';

    tr.innerHTML = `
      <td><span style="color:${typeColor}">${entry.type}</span></td>
      <td><span style="color:${statusColor}">${entry.statusCode || '...'}</span></td>
      <td title="${escapeHtml(entry.url)}">${escapeHtml(truncate(entry.url, 70))}</td>
      <td>${entry.responseSize ? formatBytes(entry.responseSize) : '-'}</td>
      <td>${entry.duration ? `${entry.duration.toFixed(0)}ms` : '...'}</td>
      <td>${formatTime(entry.startTime)}</td>
    `;

    return tr;
  }

  private getTypeColor(type: string): string {
    switch (type) {
      case 'master-playlist': return '#3498db';
      case 'media-playlist': return '#2ecc71';
      case 'segment': return '#9b59b6';
      default: return '#666';
    }
  }
}

function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len - 3) + '...' : s;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad3(d.getMilliseconds())}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function pad3(n: number): string {
  return n.toString().padStart(3, '0');
}
