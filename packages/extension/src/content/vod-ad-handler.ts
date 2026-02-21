import { showSkipOverlay, hideSkipOverlay } from './skip-overlay';

const AD_SELECTOR = '[data-a-target="ax-overlay"] video, video[aria-label="Video Advertisement"]';
const CHECK_INTERVAL = 500;
const AD_PLAYBACK_RATE = 16;

export interface VodAdStatus {
  skippedCount: number;
  log: string[];
}

const MAX_LOG_ENTRIES = 20;

/**
 * Detects VOD/display ad videos and fast-forwards through them.
 * VOD ads appear as a separate <video> element inside [data-a-target="ax-overlay"]
 * with aria-label="Video Advertisement" and a direct mp4 src.
 *
 * Strategy: mute + set playbackRate to 16x on every poll tick.
 * Handles sequential ads (e.g. "Ad 1/2", "Ad 2/2") by tracking src changes.
 */
export class VodAdHandler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private skippedCount = 0;
  private eventLog: string[] = [];
  /** The src of the ad currently being handled */
  private currentAdSrc: string | null = null;

  getStatus(): VodAdStatus {
    return {
      skippedCount: this.skippedCount,
      log: [...this.eventLog],
    };
  }

  start(): void {
    if (this.intervalId !== null) return;
    this.intervalId = setInterval(() => this.check(), CHECK_INTERVAL);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private check(): void {
    const adVideo = document.querySelector<HTMLVideoElement>(AD_SELECTOR);

    if (!adVideo) {
      // Ad was playing but is now gone → count it
      if (this.currentAdSrc !== null) {
        this.skippedCount++;
        this.log(`Ad finished (#${this.skippedCount})`);
        this.currentAdSrc = null;
        hideSkipOverlay();
      }
      return;
    }

    // New ad (first appearance or src changed = next ad in sequence)
    if (adVideo.src !== this.currentAdSrc) {
      // Count the previous ad if there was one (sequential ad transition)
      if (this.currentAdSrc !== null) {
        this.skippedCount++;
        this.log(`Ad finished (#${this.skippedCount})`);
      }

      this.currentAdSrc = adVideo.src;
      const duration =
        (adVideo.duration && isFinite(adVideo.duration) ? adVideo.duration : 0) ||
        parseFloat(adVideo.src.match(/[&?]d=([\d.]+)/)?.[1] ?? '0');
      this.log(`Ad detected (${duration.toFixed(1)}s) — muting + ${AD_PLAYBACK_RATE}x`);
      showSkipOverlay();
    }

    // Always enforce mute + speed (Twitch may reset these)
    if (!adVideo.muted) adVideo.muted = true;
    if (adVideo.volume > 0) adVideo.volume = 0;
    if (adVideo.playbackRate !== AD_PLAYBACK_RATE) adVideo.playbackRate = AD_PLAYBACK_RATE;
  }

  private log(msg: string): void {
    const time = new Date().toLocaleTimeString('ja-JP', { hour12: false });
    this.eventLog.push(`[${time}] ${msg}`);
    if (this.eventLog.length > MAX_LOG_ENTRIES) {
      this.eventLog.shift();
    }
    console.log(`[VodAdHandler] ${msg}`);
  }
}
