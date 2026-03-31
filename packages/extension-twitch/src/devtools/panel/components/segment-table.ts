import type { HlsPlaylist } from '@ad-skipper/shared';

/**
 * Table showing segments from the latest playlist, with ad segments highlighted.
 */
export class SegmentTable {
  private tbody: HTMLTableSectionElement;

  constructor(tableId: string) {
    const table = document.getElementById(tableId) as HTMLTableElement;
    this.tbody = table.querySelector('tbody')!;
  }

  update(playlist: HlsPlaylist): void {
    this.tbody.innerHTML = '';

    for (const seg of playlist.segments) {
      const tr = document.createElement('tr');
      if (seg.isAd) tr.classList.add('ad');

      tr.innerHTML = `
        <td>${seg.mediaSequence}</td>
        <td>${seg.duration.toFixed(3)}s</td>
        <td>${seg.isAd ? '<span style="color:#e74c3c">AD</span>' : 'Live'}</td>
        <td title="${escapeHtml(seg.uri)}">${escapeHtml(truncate(seg.uri, 60))}</td>
        <td>${seg.programDateTime ?? ''}</td>
      `;

      this.tbody.appendChild(tr);
    }

    // Auto-scroll to bottom
    this.tbody.parentElement?.parentElement?.scrollTo(0, 999999);
  }

  clear(): void {
    this.tbody.innerHTML = '';
  }
}

function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len - 3) + '...' : s;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
