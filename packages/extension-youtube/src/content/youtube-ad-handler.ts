import { showSkipOverlay, hideSkipOverlay, updateSkipOverlayTimer } from './skip-overlay';

const PLAYER_SELECTOR = '#movie_player';
const PREVIEW_SELECTOR = '.ytp-ad-preview-text-modern, .ytp-ad-text, .ytp-ad-preview-container';

const POLL_INTERVAL = 300;
const SKIP_RETRY_INTERVAL = 1500;
const MAX_LOG_ENTRIES = 50;

export interface YouTubeAdStatus {
  adSkipCount: number;
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
  private isAdPlaying = false;
  private autoSkipEnabled = true;
  private eventLog: string[] = [];
  private stateCallbacks: StateChangeCallback[] = [];
  private lastSkipAttempt = 0;
  private apiDumped = false;

  onStateChange(cb: StateChangeCallback): void {
    this.stateCallbacks.push(cb);
  }

  private emitState(state: BadgeState): void {
    for (const cb of this.stateCallbacks) cb(state);
  }

  getStatus(): YouTubeAdStatus {
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
    chrome.storage.local.set({ ytAutoSkip: enabled });
    this.log(`Auto-skip: ${enabled ? 'ON' : 'OFF'}`);
    this.emitState(enabled ? (this.isAdPlaying ? 'ad' : 'on') : 'off');
  }

  start(): void {
    if (this.observer || this.pollId) return;

    // Listen for results from the MAIN world page script
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (event.data?.source !== 'yt-ad-skipper-page') return;
      if (event.data.type === 'skip-result') {
        this.log(`[PAGE] ${event.data.method}: ${event.data.detail}`);
      }
    });

    chrome.storage.local.get(['ytAutoSkip'], (data) => {
      if (data.ytAutoSkip !== undefined) {
        this.autoSkipEnabled = data.ytAutoSkip;
      }
      this.log(`Started (auto-skip: ${this.autoSkipEnabled ? 'ON' : 'OFF'})`);
      this.emitState(this.autoSkipEnabled ? 'on' : 'off');
    });

    this.setupObserver();

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
      if (!this.isAdPlaying) {
        this.isAdPlaying = true;
        this.lastSkipAttempt = 0;
        this.log('Ad detected');
        this.emitState('ad');
        showSkipOverlay();

        // Dump player API once to see what methods are available
        if (!this.apiDumped) {
          this.apiDumped = true;
          window.postMessage({ source: 'yt-ad-skipper', type: 'dump-player-api' }, '*');
        }
      }

      // Retry skip every SKIP_RETRY_INTERVAL
      const now = Date.now();
      if (now - this.lastSkipAttempt > SKIP_RETRY_INTERVAL) {
        this.lastSkipAttempt = now;
        this.log('Attempting skip via page script...');
        window.postMessage({ source: 'yt-ad-skipper', type: 'skip-ad' }, '*');
      }

      const timerText = this.getAdTimerText();
      updateSkipOverlayTimer(timerText ? `広告 ${timerText}` : '');

    } else if (this.isAdPlaying && !adShowing) {
      this.adSkipCount++;
      this.log(`Ad ended (#${this.adSkipCount})`);
      this.isAdPlaying = false;
      this.emitState('on');
      hideSkipOverlay();

      // Ad ended — resume playback (video may be stuck paused after seek-skip)
      setTimeout(() => {
        window.postMessage({ source: 'yt-ad-skipper', type: 'resume-playback' }, '*');
      }, 300);
    }
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
