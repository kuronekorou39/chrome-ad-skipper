import type { NetworkLogEntry, HlsPlaylist, AdState } from '@twitch-swap/shared';

interface TimelineEvent {
  time: number;
  type: string;
  isAd?: boolean;
}

/**
 * Canvas-based timeline showing HLS events and ad breaks over time.
 */
export class Timeline {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private events: TimelineEvent[] = [];
  private adRegions: { start: number; end?: number }[] = [];
  private startTime = 0;
  private currentAdState: AdState = 'none';

  constructor(canvasId: string) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.setupResize();
    this.draw();
  }

  private setupResize(): void {
    const observer = new ResizeObserver(() => {
      this.canvas.width = this.canvas.clientWidth * devicePixelRatio;
      this.canvas.height = this.canvas.clientHeight * devicePixelRatio;
      this.ctx.scale(devicePixelRatio, devicePixelRatio);
      this.draw();
    });
    observer.observe(this.canvas);
  }

  addEvent(event: TimelineEvent): void {
    if (this.events.length === 0) {
      this.startTime = event.time;
    }
    this.events.push(event);
    this.draw();
  }

  setAdState(state: AdState, time: number): void {
    if (state !== 'none' && this.currentAdState === 'none') {
      // Ad started
      this.adRegions.push({ start: time });
    } else if (state === 'none' && this.currentAdState !== 'none') {
      // Ad ended
      const last = this.adRegions[this.adRegions.length - 1];
      if (last && !last.end) {
        last.end = time;
      }
    }
    this.currentAdState = state;
    this.draw();
  }

  markAdEvent(time: number): void {
    this.addEvent({ time, type: 'ad-marker', isAd: true });
  }

  clear(): void {
    this.events = [];
    this.adRegions = [];
    this.startTime = 0;
    this.currentAdState = 'none';
    this.draw();
  }

  rebuild(logs: NetworkLogEntry[], playlists: HlsPlaylist[]): void {
    this.events = [];
    this.adRegions = [];
    this.startTime = 0;

    for (const log of logs) {
      this.addEvent({ time: log.startTime, type: log.type, isAd: log.isAd });
    }

    // Reconstruct ad regions from playlists
    let wasAd = false;
    for (const pl of playlists) {
      const isAd = pl.adState !== 'none';
      if (isAd && !wasAd) {
        this.adRegions.push({ start: pl.fetchedAt });
      } else if (!isAd && wasAd) {
        const last = this.adRegions[this.adRegions.length - 1];
        if (last && !last.end) last.end = pl.fetchedAt;
      }
      wasAd = isAd;
    }

    this.draw();
  }

  private draw(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#0f0f23';
    ctx.fillRect(0, 0, w, h);

    if (this.events.length === 0) {
      ctx.fillStyle = '#555';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for HLS events...', w / 2, h / 2);
      return;
    }

    const now = Date.now();
    const timeSpan = Math.max(now - this.startTime, 30000); // At least 30s window
    const timeToX = (t: number) => ((t - this.startTime) / timeSpan) * w;

    // Draw ad regions (red bands)
    ctx.fillStyle = 'rgba(231, 76, 60, 0.2)';
    for (const region of this.adRegions) {
      const x1 = timeToX(region.start);
      const x2 = timeToX(region.end ?? now);
      ctx.fillRect(x1, 0, x2 - x1, h);
    }

    // Draw time axis
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    const axisY = h - 20;
    ctx.beginPath();
    ctx.moveTo(0, axisY);
    ctx.lineTo(w, axisY);
    ctx.stroke();

    // Time labels
    ctx.fillStyle = '#666';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    const tickInterval = this.calcTickInterval(timeSpan);
    const firstTick = Math.ceil(this.startTime / tickInterval) * tickInterval;
    for (let t = firstTick; t < this.startTime + timeSpan; t += tickInterval) {
      const x = timeToX(t);
      const seconds = Math.floor((t - this.startTime) / 1000);
      ctx.fillText(`${seconds}s`, x, h - 4);
      ctx.beginPath();
      ctx.moveTo(x, axisY);
      ctx.lineTo(x, axisY + 4);
      ctx.stroke();
    }

    // Draw events
    const rowH = 20;
    const rows: Record<string, number> = {
      'master-playlist': 0,
      'media-playlist': 1,
      'segment': 2,
      'ad-marker': 3,
      'unknown': 4,
    };

    for (const event of this.events) {
      const x = timeToX(event.time);
      const row = rows[event.type] ?? 4;
      const y = 10 + row * rowH;

      ctx.fillStyle = event.isAd ? '#e74c3c' : this.getColorForType(event.type);
      ctx.fillRect(x - 1, y, 3, rowH - 4);
    }

    // Row labels
    ctx.fillStyle = '#666';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    const labels = ['master', 'media', 'segment', 'ad', 'other'];
    for (let i = 0; i < labels.length; i++) {
      ctx.fillText(labels[i], 4, 10 + i * rowH + rowH / 2 + 3);
    }
  }

  private getColorForType(type: string): string {
    switch (type) {
      case 'master-playlist': return '#3498db';
      case 'media-playlist': return '#2ecc71';
      case 'segment': return '#9b59b6';
      case 'ad-marker': return '#e74c3c';
      default: return '#666';
    }
  }

  private calcTickInterval(timeSpanMs: number): number {
    const seconds = timeSpanMs / 1000;
    if (seconds < 60) return 5000;
    if (seconds < 300) return 30000;
    return 60000;
  }
}
