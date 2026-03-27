import type { VideoElementState } from '@twitch-swap/shared';

type StateUpdateCallback = (states: VideoElementState[]) => void;

/**
 * Tracks the state of <video> elements by periodic polling.
 * Captures playback state, dimensions, visibility, etc.
 */
export class VideoTracker {
  private elements: HTMLVideoElement[] = [];
  private callbacks: StateUpdateCallback[] = [];
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private readonly POLL_MS = 500;

  onStateUpdate(cb: StateUpdateCallback): void {
    this.callbacks.push(cb);
  }

  updateElements(videos: HTMLVideoElement[]): void {
    this.elements = videos;
    // Immediately capture state on change
    this.captureAndBroadcast();
  }

  startPolling(): void {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(() => {
      if (this.elements.length > 0) {
        this.captureAndBroadcast();
      }
    }, this.POLL_MS);
  }

  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private captureAndBroadcast(): void {
    try {
      const states = this.elements.map((el, index) => this.captureState(el, index));
      for (const cb of this.callbacks) {
        cb(states);
      }
    } catch (err) {
      console.error('[VideoTracker] captureAndBroadcast error:', err);
    }
  }

  private captureState(el: HTMLVideoElement, index: number): VideoElementState {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);

    return {
      index,
      selector: this.buildSelector(el),
      src: el.src || '',
      hasSrcObject: el.srcObject !== null,
      currentTime: el.currentTime,
      duration: el.duration,
      paused: el.paused,
      muted: el.muted,
      volume: el.volume,
      videoWidth: el.videoWidth,
      videoHeight: el.videoHeight,
      readyState: el.readyState,
      networkState: el.networkState,
      display: style.display,
      visibility: style.visibility,
      boundingRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      timestamp: Date.now(),
    };
  }

  private buildSelector(el: HTMLVideoElement): string {
    const parts: string[] = [];
    let current: Element | null = el;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector += `#${current.id}`;
        parts.unshift(selector);
        break;
      }
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\s+/).slice(0, 2).join('.');
        if (classes) selector += `.${classes}`;
      }
      parts.unshift(selector);
      current = current.parentElement;
    }

    return parts.join(' > ');
  }
}
