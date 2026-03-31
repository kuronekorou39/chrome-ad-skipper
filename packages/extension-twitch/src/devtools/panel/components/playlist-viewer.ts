import type { HlsPlaylist } from '@ad-skipper/shared';
import { AD_TAGS } from '@ad-skipper/shared';

/**
 * Displays the raw playlist with ad-related tags highlighted.
 */
export class PlaylistViewer {
  private rawEl: HTMLPreElement;
  private infoEl: HTMLDivElement;

  constructor(rawId: string, infoId: string) {
    this.rawEl = document.getElementById(rawId) as HTMLPreElement;
    this.infoEl = document.getElementById(infoId) as HTMLDivElement;
  }

  update(playlist: HlsPlaylist): void {
    // Info section
    this.infoEl.innerHTML = `
      <div>URL: <span style="color:#3498db">${escapeHtml(playlist.url)}</span></div>
      <div>
        Segments: ${playlist.segments.length} |
        Sequence: ${playlist.mediaSequence} |
        Target Duration: ${playlist.targetDuration}s |
        Ad State: <span style="color:${playlist.adState === 'none' ? '#2ecc71' : '#e74c3c'}">${playlist.adState}</span> |
        Markers: ${playlist.adMarkers.length}
      </div>
    `;

    // Raw playlist with highlighted ad tags
    const lines = playlist.raw.split('\n');
    const htmlLines = lines.map((line) => {
      const trimmed = line.trim();
      if (this.isAdTag(trimmed)) {
        return `<span class="highlight-ad">${escapeHtml(line)}</span>`;
      }
      return escapeHtml(line);
    });

    this.rawEl.innerHTML = htmlLines.join('\n');
  }

  clear(): void {
    this.rawEl.textContent = '';
    this.infoEl.innerHTML = '';
  }

  private isAdTag(line: string): boolean {
    return (
      line.startsWith(AD_TAGS.CUE_OUT) ||
      line.startsWith(AD_TAGS.CUE_OUT_CONT) ||
      line.startsWith(AD_TAGS.CUE_IN) ||
      (line.startsWith(AD_TAGS.DATERANGE) && line.includes('twitch-stitched'))
    );
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
