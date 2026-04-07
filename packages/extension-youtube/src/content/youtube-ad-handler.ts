import { showSkipOverlay, hideSkipOverlay, updateSkipOverlayTimer } from './skip-overlay';

/** Selectors for the skip button (YouTube changes these periodically) */
const SKIP_SELECTORS = [
  'button.ytp-ad-skip-button-modern',
  '.ytp-ad-skip-button',
  '.ytp-skip-ad-button',
];

/** The player element that gets .ad-showing during ads */
const PLAYER_SELECTOR = '#movie_player';

/** Non-skippable ad indicator */
const PREVIEW_SELECTOR = '.ytp-ad-preview-text-modern, .ytp-ad-text';

const POLL_INTERVAL = 200;
const AD_PLAYBACK_RATE = 16;
const MAX_LOG_ENTRIES = 30;

export interface YouTubeAdStatus {
  adSkipCount: number;
  adSpeedUpCount: number;
  isAdPlaying: boolean;
  autoSkipEnabled: boolean;
  eventLog: string[];
}

type BadgeState = 'on' | 'ad' | 'off';
type StateChangeCallback = (state: BadgeState) => void;

export class YouTubeAdHandler {
  private observer: MutationObserver | null = null;
  private pollId: ReturnType<typeof setInterval> | null = null;
  private adSkipCount = 0;
  private adSpeedUpCount = 0;
  private isAdPlaying = false;
  private autoSkipEnabled = true;
  private eventLog: string[] = [];
  private savedPlaybackRate = 1;
  private savedMuted = false;
  private savedVolume = 1;
  private stateCallbacks: StateChangeCallback[] = [];

  onStateChange(cb: StateChangeCallback): void {
    this.stateCallbacks.push(cb);
  }

  private emitState(state: BadgeState): void {
    for (const cb of this.stateCallbacks) cb(state);
  }

  getStatus(): YouTubeAdStatus {
    return {
      adSkipCount: this.adSkipCount,
      adSpeedUpCount: this.adSpeedUpCount,
      isAdPlaying: this.isAdPlaying,
      autoSkipEnabled: this.autoSkipEnabled,
      eventLog: [...this.eventLog],
    };
  }

  setAutoSkip(enabled: boolean): void {
    if (this.autoSkipEnabled === enabled) return;
    this.autoSkipEnabled = enabled;
    chrome.storage.local.set({ ytAutoSkip: enabled });
    this.log(`Auto-skip: ${enabled ? 'ON' : 'OFF'}`);
    this.emitState(enabled ? (this.isAdPlaying ? 'ad' : 'on') : 'off');
  }

  start(): void {
    if (this.observer || this.pollId) return;

    chrome.storage.local.get(['ytAutoSkip'], (data) => {
      if (data.ytAutoSkip !== undefined) {
        this.autoSkipEnabled = data.ytAutoSkip;
      }
      this.log(`Started (auto-skip: ${this.autoSkipEnabled ? 'ON' : 'OFF'})`);
      this.emitState(this.autoSkipEnabled ? 'on' : 'off');
    });

    // Watch for the player element and observe class changes
    this.setupObserver();

    // Fallback polling in case MutationObserver misses something
    this.pollId = setInterval(() => {
      try {
        this.check();
      } catch (e) {
        this.log(`Error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }, POLL_INTERVAL);
  }

  stop(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.pollId) {
      clearInterval(this.pollId);
      this.pollId = null;
    }
  }

  private setupObserver(): void {
    const trySetup = (): void => {
      const player = document.querySelector(PLAYER_SELECTOR);
      if (!player) {
        // YouTube SPA: player may not exist yet, retry
        setTimeout(trySetup, 1000);
        return;
      }

      this.observer = new MutationObserver(() => {
        try { this.check(); } catch { /* handled by poll */ }
      });
      this.observer.observe(player, { attributes: true, attributeFilter: ['class'] });
    };
    trySetup();
  }

  private check(): void {
    const player = document.querySelector(PLAYER_SELECTOR);
    if (!player) return;

    const adShowing = player.classList.contains('ad-showing');

    if (adShowing && this.autoSkipEnabled) {
      this.handleAdPlaying();
    } else if (this.isAdPlaying && !adShowing) {
      this.handleAdEnded();
    }
  }

  private handleAdPlaying(): void {
    // First: always try to click the skip button
    if (this.tryClickSkip()) {
      if (!this.isAdPlaying) {
        this.adSkipCount++;
        this.log(`Ad #${this.adSkipCount + this.adSpeedUpCount} — skip button clicked`);
      }
      // Don't set isAdPlaying — the ad should end immediately after clicking skip
      return;
    }

    // No skip button available — speed up
    const video = this.findAdVideo();
    if (!video) return;

    if (!this.isAdPlaying) {
      // Entering ad state for the first time
      this.isAdPlaying = true;
      this.adSpeedUpCount++;

      // Save current state
      this.savedPlaybackRate = video.playbackRate;
      this.savedMuted = video.muted;
      this.savedVolume = video.volume;

      this.log(`Ad #${this.adSkipCount + this.adSpeedUpCount} — applying ${AD_PLAYBACK_RATE}x + mute`);
      this.emitState('ad');
      showSkipOverlay();
    }

    // Apply speed up + mute
    if (video.playbackRate !== AD_PLAYBACK_RATE) {
      video.playbackRate = AD_PLAYBACK_RATE;
    }
    if (!video.muted) video.muted = true;

    // Update timer text on overlay
    const timerText = this.getAdTimerText();
    updateSkipOverlayTimer(timerText ? `広告 ${timerText}` : '');

    // Keep trying to click skip in case it appears mid-ad
    this.tryClickSkip();
  }

  private handleAdEnded(): void {
    this.isAdPlaying = false;
    this.log(`Ad #${this.adSkipCount + this.adSpeedUpCount} finished — restoring`);
    this.emitState('on');

    // Restore video state
    const video = document.querySelector<HTMLVideoElement>('video');
    if (video) {
      video.playbackRate = this.savedPlaybackRate;
      video.muted = this.savedMuted;
      video.volume = this.savedVolume;
    }

    hideSkipOverlay();
  }

  private tryClickSkip(): boolean {
    for (const selector of SKIP_SELECTORS) {
      const btn = document.querySelector<HTMLElement>(selector);
      if (btn && btn.offsetParent !== null) {
        btn.click();
        return true;
      }
    }
    return false;
  }

  private findAdVideo(): HTMLVideoElement | null {
    const video = document.querySelector<HTMLVideoElement>('video.html5-main-video');
    if (video && !video.paused) return video;

    // Fallback: first non-paused video
    const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('video'));
    for (let i = 0; i < videos.length; i++) {
      if (!videos[i].paused && videos[i].videoWidth > 0) return videos[i];
    }
    return null;
  }

  private getAdTimerText(): string {
    const el = document.querySelector(PREVIEW_SELECTOR);
    return el?.textContent?.trim() ?? '';
  }

  private log(msg: string): void {
    const time = new Date().toLocaleTimeString('ja-JP', { hour12: false });
    this.eventLog.push(`[${time}] ${msg}`);
    if (this.eventLog.length > MAX_LOG_ENTRIES) {
      this.eventLog.shift();
    }
  }
}
