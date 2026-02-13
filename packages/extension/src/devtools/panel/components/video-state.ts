import type { VideoElementState } from '@twitch-swap/shared';

/**
 * Displays the current state of all video elements on the page.
 */
export class VideoState {
  private container: HTMLDivElement;

  constructor(containerId: string) {
    this.container = document.getElementById(containerId) as HTMLDivElement;
  }

  update(videos: VideoElementState[]): void {
    this.container.innerHTML = '';

    if (videos.length === 0) {
      this.container.innerHTML = '<div style="color:#666;padding:20px">No video elements detected</div>';
      return;
    }

    for (const video of videos) {
      const card = document.createElement('div');
      card.classList.add('video-card');

      const statusColor = video.paused ? '#e74c3c' : '#2ecc71';
      const status = video.paused ? 'Paused' : 'Playing';
      const rect = video.boundingRect ?? { x: 0, y: 0, width: 0, height: 0 };

      card.innerHTML = `
        <h3>Video #${video.index} <span style="color:${statusColor}">[${status}]</span></h3>
        ${prop('Selector', video.selector ?? '')}
        ${prop('Source', video.src || (video.hasSrcObject ? '[MediaSource/srcObject]' : 'none'))}
        ${prop('Resolution', `${video.videoWidth ?? 0}x${video.videoHeight ?? 0}`)}
        ${prop('Current Time', `${safeNum(video.currentTime)}s`)}
        ${prop('Duration', formatDuration(video.duration))}
        ${prop('Muted', video.muted ? 'Yes' : 'No')}
        ${prop('Volume', `${safeNum(video.volume * 100, 0)}%`)}
        ${prop('Ready State', readyStateLabel(video.readyState))}
        ${prop('Network State', networkStateLabel(video.networkState))}
        ${prop('Display', video.display ?? '')}
        ${prop('Visibility', video.visibility ?? '')}
        ${prop('Position', `${safeNum(rect.x, 0)}, ${safeNum(rect.y, 0)} (${safeNum(rect.width, 0)}x${safeNum(rect.height, 0)})`)}
      `;

      this.container.appendChild(card);
    }
  }

  clear(): void {
    this.container.innerHTML = '';
  }
}

function safeNum(val: unknown, decimals = 2): string {
  if (val == null || typeof val !== 'number' || !isFinite(val)) return '?';
  return val.toFixed(decimals);
}

function formatDuration(val: unknown): string {
  if (val == null || typeof val !== 'number') return 'LIVE';
  if (!isFinite(val)) return 'LIVE';
  return `${val.toFixed(2)}s`;
}

function prop(key: string, value: string): string {
  return `<div class="prop"><span class="prop-key">${key}</span><span class="prop-value">${escapeHtml(value)}</span></div>`;
}

function readyStateLabel(state: number): string {
  const labels = ['HAVE_NOTHING', 'HAVE_METADATA', 'HAVE_CURRENT_DATA', 'HAVE_FUTURE_DATA', 'HAVE_ENOUGH_DATA'];
  return `${state ?? '?'} (${labels[state] ?? 'unknown'})`;
}

function networkStateLabel(state: number): string {
  const labels = ['EMPTY', 'IDLE', 'LOADING', 'NO_SOURCE'];
  return `${state ?? '?'} (${labels[state] ?? 'unknown'})`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
