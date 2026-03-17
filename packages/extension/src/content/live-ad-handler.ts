import { MESSAGE_SOURCE } from '@twitch-swap/shared';
import { isAdBreakActive } from './ad-detection';
import { showSkipOverlay, hideSkipOverlay } from './skip-overlay';

const CHECK_INTERVAL = 500;
const DEFAULT_PLAYBACK_RATE = 16;
const MAX_LOG_ENTRIES = 20;

export interface LiveAdStatus {
  skippedCount: number;
  isAdPlaying: boolean;
  log: string[];
}

/**
 * Fallback ad handler for Twitch live streams when PbyP swap is unavailable.
 *
 * When an ad break is detected and StreamSwapper is NOT actively swapping,
 * this handler mutes the main video, speeds it up to 2x (best-effort on
 * live HLS — higher rates cause buffer stalls), and shows the skip overlay.
 *
 * The primary value is hiding the ad (mute + overlay). Speed-up is best-effort.
 */
export class LiveAdHandler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isAdPlaying = false;
  private skippedCount = 0;
  private savedMuted = false;
  private savedVolume = 1;
  private eventLog: string[] = [];
  private swapActiveCheck: () => boolean;
  private playbackRate = DEFAULT_PLAYBACK_RATE;

  constructor(swapActiveCheck: () => boolean) {
    this.swapActiveCheck = swapActiveCheck;
  }

  setPlaybackRate(rate: number): void {
    this.playbackRate = rate;
  }

  getStatus(): LiveAdStatus {
    return {
      skippedCount: this.skippedCount,
      isAdPlaying: this.isAdPlaying,
      log: [...this.eventLog],
    };
  }

  start(): void {
    if (this.intervalId !== null) return;
    this.intervalId = setInterval(() => this.check(), CHECK_INTERVAL);
    this.log('Started');
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    // Restore if currently handling an ad
    if (this.isAdPlaying) {
      this.restorePlayback();
    }
  }

  private check(): void {
    // Don't interfere when StreamSwapper is actively swapping
    if (this.swapActiveCheck()) {
      if (this.isAdPlaying) {
        this.log('StreamSwapper took over — restoring');
        this.restorePlayback();
      }
      return;
    }

    const adActive = isAdBreakActive();

    if (adActive && !this.isAdPlaying) {
      // Ad started
      this.isAdPlaying = true;
      this.skippedCount++;

      const video = this.findMainVideo();
      if (video) {
        this.savedMuted = video.muted;
        this.savedVolume = video.volume;
        video.muted = true;
        video.volume = 0;
      }

      // Lock playbackRate via MAIN world to survive Twitch player resets
      this.postToPage('lock-playback-rate', { rate: this.playbackRate });

      this.log(`Ad #${this.skippedCount} detected — mute + ${this.playbackRate}x`);

      const playerEl = document.querySelector<HTMLElement>('.video-player__container')
        ?? document.querySelector<HTMLElement>('[data-a-target="video-player"]');
      showSkipOverlay(playerEl ?? undefined);
    } else if (adActive && this.isAdPlaying) {
      // Ad ongoing — keep enforcing mute (speed is locked via MAIN world)
      const video = this.findMainVideo();
      if (video) {
        if (!video.muted) video.muted = true;
        if (video.volume > 0) video.volume = 0;
      }
    } else if (!adActive && this.isAdPlaying) {
      // Ad ended
      this.log(`Ad #${this.skippedCount} finished — restoring`);
      this.restorePlayback();
    }
  }

  private restorePlayback(): void {
    this.isAdPlaying = false;

    // Unlock playbackRate first (restores rate to 1 in MAIN world)
    this.postToPage('unlock-playback-rate', {});

    const video = this.findMainVideo();
    if (video) {
      video.muted = this.savedMuted;
      video.volume = this.savedVolume;
    }

    hideSkipOverlay();
  }

  private postToPage(type: string, data: unknown): void {
    window.postMessage({ source: MESSAGE_SOURCE.CONTENT, type, data }, '*');
  }

  private findMainVideo(): HTMLVideoElement | null {
    const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('video'));
    for (const v of videos) {
      if (v.readyState > 0 && v.videoWidth > 0) return v;
    }
    return null;
  }

  private log(msg: string): void {
    const time = new Date().toLocaleTimeString('ja-JP', { hour12: false });
    this.eventLog.push(`[${time}] ${msg}`);
    if (this.eventLog.length > MAX_LOG_ENTRIES) {
      this.eventLog.shift();
    }
    console.log(`[LiveAdHandler] ${msg}`);
  }
}
