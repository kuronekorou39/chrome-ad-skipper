type VideoElementsCallback = (videos: HTMLVideoElement[]) => void;

/**
 * Observes DOM for <video> elements appearing/disappearing.
 * Key for detecting Twitch's dual-video setup during ads.
 */
export class DomObserver {
  private observer: MutationObserver | null = null;
  private callbacks: VideoElementsCallback[] = [];
  private knownVideos = new Set<HTMLVideoElement>();

  onVideoElementsChanged(cb: VideoElementsCallback): void {
    this.callbacks.push(cb);
  }

  start(): void {
    // Initial scan
    this.scanForVideos();

    // Watch for DOM changes
    this.observer = new MutationObserver(() => {
      this.scanForVideos();
    });

    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  private scanForVideos(): void {
    const videoArray = Array.from(document.querySelectorAll<HTMLVideoElement>('video'));
    const currentVideos = new Set<HTMLVideoElement>(videoArray);

    // Check for changes
    let changed = currentVideos.size !== this.knownVideos.size;
    if (!changed) {
      for (const v of videoArray) {
        if (!this.knownVideos.has(v)) {
          changed = true;
          break;
        }
      }
    }

    if (changed) {
      this.knownVideos = currentVideos;
      for (const cb of this.callbacks) {
        cb(videoArray);
      }
    }
  }
}
