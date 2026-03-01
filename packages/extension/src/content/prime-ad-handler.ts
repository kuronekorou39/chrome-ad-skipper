import { showSkipOverlay, hideSkipOverlay, updateSkipOverlayTimer } from './skip-overlay';

const AD_OVERLAY_SELECTOR = '[class*="atvwebplayersdk-ad"]';
const AD_TIMER_SELECTOR = '.atvwebplayersdk-ad-timer-remaining-time';
const POLL_INTERVAL = 200;
const AD_PLAYBACK_RATE = 16;
const MAX_LOG_ENTRIES = 30;

export interface PrimeAdStatus {
  adSkipCount: number;
  isAdPlaying: boolean;
  autoSkipEnabled: boolean;
  eventLog: string[];
}

/**
 * Detects Prime Video ad overlays and fast-forwards through them.
 *
 * Detection: [class*="atvwebplayersdk-ad"] overlay visible = ad playing.
 * Action: speed up the playing video to 16x + mute during ad,
 * restore to 1x + original audio when ad overlay disappears.
 */
type BadgeState = 'on' | 'ad' | 'off';
type StateChangeCallback = (state: BadgeState) => void;

export class PrimeAdHandler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private adSkipCount = 0;
  private isAdPlaying = false;
  private autoSkipEnabled = true;
  private eventLog: string[] = [];
  /** Saved audio state to restore after ad */
  private savedMuted = false;
  private savedVolume = 1;
  private stateCallbacks: StateChangeCallback[] = [];

  onStateChange(cb: StateChangeCallback): void {
    this.stateCallbacks.push(cb);
  }

  private emitState(state: BadgeState): void {
    for (const cb of this.stateCallbacks) cb(state);
  }

  getStatus(): PrimeAdStatus {
    return {
      adSkipCount: this.adSkipCount,
      isAdPlaying: this.isAdPlaying,
      autoSkipEnabled: this.autoSkipEnabled,
      eventLog: [...this.eventLog],
    };
  }

  setAutoSkip(enabled: boolean): void {
    if (this.autoSkipEnabled === enabled) return;
    this.autoSkipEnabled = enabled;
    chrome.storage.local.set({ pvAutoSkip: enabled });
    this.log(`Auto-skip: ${enabled ? 'ON' : 'OFF'}`);
    this.emitState(enabled ? (this.isAdPlaying ? 'ad' : 'on') : 'off');
  }

  start(): void {
    if (this.intervalId !== null) return;

    // Restore saved setting
    chrome.storage.local.get(['pvAutoSkip'], (data) => {
      if (data.pvAutoSkip !== undefined) {
        this.autoSkipEnabled = data.pvAutoSkip;
      }
      this.log(`Started (auto-skip: ${this.autoSkipEnabled ? 'ON' : 'OFF'})`);
      this.emitState(this.autoSkipEnabled ? 'on' : 'off');
    });

    this.intervalId = setInterval(() => {
      try {
        this.check();
      } catch (e) {
        this.log(`Error: ${(e as Error).message}`);
      }
    }, POLL_INTERVAL);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private check(): void {
    const adVisible = this.isAdOverlayVisible();
    const playingVideo = this.findPlayingVideo();

    if (adVisible && this.autoSkipEnabled) {
      // --- AD PLAYING ---
      if (!this.isAdPlaying) {
        this.isAdPlaying = true;
        this.adSkipCount++;
        // Save audio state before muting
        if (playingVideo) {
          this.savedMuted = playingVideo.muted;
          this.savedVolume = playingVideo.volume;
        }
        this.log(`Ad #${this.adSkipCount} detected — applying ${AD_PLAYBACK_RATE}x + mute`);
        this.emitState('ad');
        showSkipOverlay();
      }

      // Update timer display on overlay
      const remaining = document.querySelector(AD_TIMER_SELECTOR)?.textContent ?? '';
      updateSkipOverlayTimer(remaining ? `広告 ${remaining}` : '');

      // Choose speed based on remaining time — slow down near the end
      // to avoid overshooting into content at high speed
      const targetRate = this.rateForRemaining(remaining);

      // Speed up + mute whatever is playing
      if (playingVideo) {
        if (playingVideo.playbackRate !== targetRate) {
          playingVideo.playbackRate = targetRate;
        }
        if (!playingVideo.muted) playingVideo.muted = true;
        if (playingVideo.volume > 0) playingVideo.volume = 0;
      }
    } else if (this.isAdPlaying && !adVisible) {
      // --- AD ENDED ---
      this.isAdPlaying = false;
      this.log(`Ad #${this.adSkipCount} finished — restoring 1x`);
      this.emitState('on');

      // Restore ALL videos to normal
      const videos = document.querySelectorAll<HTMLVideoElement>('video');
      videos.forEach((v) => {
        if (v.playbackRate !== 1) v.playbackRate = 1;
        v.muted = this.savedMuted;
        v.volume = this.savedVolume;
      });

      // Keep overlay visible until video is actually progressing
      this.waitForContentPlaying().then(() => hideSkipOverlay());
    }
  }

  /** Parse "M:SS" timer text into seconds. Returns Infinity if unparseable. */
  private parseRemainingSeconds(text: string): number {
    const m = text.match(/(\d+):(\d{2})/);
    if (!m) return Infinity;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  /** Ramp down playback rate as the ad nears its end. */
  private rateForRemaining(timerText: string): number {
    const secs = this.parseRemainingSeconds(timerText);
    if (secs <= 1) return 2;
    if (secs <= 3) return 4;
    return AD_PLAYBACK_RATE;
  }

  private isAdOverlayVisible(): boolean {
    // The ad timer element only exists while an ad is actually playing,
    // not during seekbar hover previews.
    const timer = document.querySelector(AD_TIMER_SELECTOR);
    if (!timer) return false;

    const overlays = Array.from(document.querySelectorAll(AD_OVERLAY_SELECTOR));
    for (let i = 0; i < overlays.length; i++) {
      const el = overlays[i];
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return true;
    }
    return false;
  }

  private findPlayingVideo(): HTMLVideoElement | null {
    const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('video'));
    for (let i = 0; i < videos.length; i++) {
      const v = videos[i];
      if (v.paused) continue;
      if (v.videoWidth === 0) continue;
      return v;
    }
    return null;
  }

  /** Wait until the video's currentTime is actually advancing (= content playing). */
  private waitForContentPlaying(): Promise<void> {
    return new Promise((resolve) => {
      const video = this.findPlayingVideo();
      if (!video) { resolve(); return; }

      const startTime = video.currentTime;
      let checks = 0;
      const maxChecks = 30; // 3 seconds max wait

      const timer = setInterval(() => {
        checks++;
        const v = this.findPlayingVideo();
        if (!v || checks >= maxChecks) {
          clearInterval(timer);
          resolve();
          return;
        }
        // Content is playing when time has advanced by at least 0.1s
        if (v.currentTime > startTime + 0.1 && v.playbackRate === 1) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  }

  private log(msg: string): void {
    const time = new Date().toLocaleTimeString('ja-JP', { hour12: false });
    this.eventLog.push(`[${time}] ${msg}`);
    if (this.eventLog.length > MAX_LOG_ENTRIES) {
      this.eventLog.shift();
    }
    console.log(`[広告スキッパー:Prime] ${msg}`);
  }
}
