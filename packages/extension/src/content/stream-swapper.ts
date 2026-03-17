import { MESSAGE_SOURCE } from '@twitch-swap/shared';
import { isAdBreakActive } from './ad-detection';

/**
 * Swaps the sub-stream over the ad during Twitch ad breaks.
 *
 * Detection (based on ACTIVE video count — ignoring empty placeholders):
 *   - Ad start:  active video count 1→2
 *   - Ad end:    active count back to 1, OR sub-video becomes paused
 *
 * "Active" = readyState > 0 AND videoWidth > 0 (has actual content loaded).
 */
export interface SwapStatus {
  state: 'idle' | 'swapping';
  videoCount: number;
  swapCount: number;
  log: string[];
}

const MAX_LOG_ENTRIES = 80;

type SwapStateCallback = (state: 'idle' | 'swapping') => void;

export class StreamSwapper {
  private enabled = true;
  private isSwapped = false;
  /** The main player video element (tracked continuously) */
  private originalVideo: HTMLVideoElement | null = null;
  private adVideo: HTMLVideoElement | null = null;
  private subVideo: HTMLVideoElement | null = null;
  private savedVolume = 1;
  private unmuteInterval: ReturnType<typeof setInterval> | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private subVideoWasPlaying = false;
  private subPausedTicks = 0;
  /** Saved parent/sibling so we can restore the sub-video after swap */
  private subVideoOriginalParent: ParentNode | null = null;
  private subVideoNextSibling: Node | null = null;
  private videoCount = 0;
  private swapCount = 0;
  private eventLog: string[] = [];
  private stateCallbacks: SwapStateCallback[] = [];
  /** Polls newly appeared videos that may not have loaded yet */
  private pendingCheckInterval: ReturnType<typeof setInterval> | null = null;
  /** The video count when the current pending check started */
  private pendingCheckVideoCount = 0;

  /** Whether a swap is currently active (used by LiveAdHandler to avoid conflicts) */
  get isSwapping(): boolean {
    return this.isSwapped;
  }

  onStateChange(cb: SwapStateCallback): void {
    this.stateCallbacks.push(cb);
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    if (!value && this.isSwapped) {
      this.deactivateSwap();
    }
  }

  private notifyStateChange(): void {
    const state = this.isSwapped ? 'swapping' as const : 'idle' as const;
    for (const cb of this.stateCallbacks) {
      cb(state);
    }
  }

  getStatus(): SwapStatus {
    return {
      state: this.isSwapped ? 'swapping' : 'idle',
      videoCount: this.videoCount,
      swapCount: this.swapCount,
      log: [...this.eventLog],
    };
  }

  private log(msg: string): void {
    const time = new Date().toLocaleTimeString('ja-JP', { hour12: false });
    this.eventLog.push(`[${time}] ${msg}`);
    if (this.eventLog.length > MAX_LOG_ENTRIES) {
      this.eventLog.shift();
    }
    console.log(`[StreamSwapper] ${msg}`);
  }

  /** A video is "active" if it has actual media content loaded */
  private isActive(v: HTMLVideoElement): boolean {
    return v.readyState > 0 && v.videoWidth > 0 && !this.isAdVideo(v);
  }

  /** Check if a video is a VOD/display ad (not a live sub-stream) */
  private isAdVideo(v: HTMLVideoElement): boolean {
    return (
      v.getAttribute('aria-label') === 'Video Advertisement' ||
      v.closest('[data-a-target="ax-overlay"]') !== null
    );
  }

  /** Dump per-video diagnostics for debugging */
  private dumpVideos(videos: HTMLVideoElement[], label: string): void {
    for (let i = 0; i < videos.length; i++) {
      const v = videos[i];
      const ariaLabel = v.getAttribute('aria-label') ?? '(none)';
      const inAxOverlay = v.closest('[data-a-target="ax-overlay"]') !== null;
      const inDOM = document.contains(v);
      const parentTag = v.parentElement?.tagName ?? '?';
      const parentClass = v.parentElement?.className?.slice(0, 60) ?? '';
      this.log(
        `${label} video[${i}]: ` +
        `ready=${v.readyState} ` +
        `size=${v.videoWidth}x${v.videoHeight} ` +
        `muted=${v.muted} ` +
        `paused=${v.paused} ` +
        `aria="${ariaLabel}" ` +
        `axOverlay=${inAxOverlay} ` +
        `isAd=${this.isAdVideo(v)} ` +
        `inDOM=${inDOM} ` +
        `parent=<${parentTag} class="${parentClass}">`,
      );
    }
  }

  onVideoElementsChanged(allVideos: HTMLVideoElement[]): void {
    if (!this.enabled) return;
    this.videoCount = allVideos.length;
    const active = allVideos.filter((v) => this.isActive(v));
    this.log(`Videos: ${allVideos.length} total, ${active.length} active`);

    // Dump detailed video state when multiple videos exist (ad detection scenario)
    if (allVideos.length >= 2) {
      this.dumpVideos(allVideos, 'changed');
      this.log(`adBreakActive=${isAdBreakActive()}`);
    }

    // Continuously track the main player (the sole active video when not swapping)
    if (!this.isSwapped && active.length === 1) {
      this.originalVideo = active[0];
    }

    if (!this.isSwapped) {
      // Only reset pending poll if the video element set actually changed
      // (prevents frequent DOM mutations from restarting the countdown)
      if (this.pendingCheckInterval !== null && allVideos.length === this.pendingCheckVideoCount) {
        // Same video count — let the existing poll continue
        return;
      }
      this.clearPendingCheck();
      if (active.length >= 2) {
        if (isAdBreakActive()) {
          this.activateSwap(active);
        } else {
          // PbyP video appeared but ad indicators not in DOM yet — wait for them
          this.log('Two active videos but no ad indicators yet — waiting');
          this.waitForAdIndicators(active);
        }
      } else if (allVideos.length >= 2 && active.length < 2) {
        // Multiple video elements exist but not all active yet — poll
        this.waitForActiveVideos(allVideos);
      }
    } else if (this.isSwapped && active.length <= 1) {
      // During swap, if active count drops to 1 or 0 → ad ended
      this.deactivateSwap();
    }
  }

  /**
   * Some video elements may appear empty (readyState=0) briefly before loading.
   * Poll until both are active, then hand off to waitForAdIndicators.
   */
  private waitForActiveVideos(allVideos: HTMLVideoElement[]): void {
    let checks = 0;
    this.pendingCheckVideoCount = allVideos.length;
    this.log(`Polling ${allVideos.length} videos for active state...`);
    this.pendingCheckInterval = setInterval(() => {
      checks++;
      const alive = allVideos.filter((v) => document.contains(v));
      const active = alive.filter((v) => this.isActive(v));

      // Log details every 5th check (1s intervals) and on the last check
      if (checks % 5 === 1 || checks >= 30) {
        this.log(`Poll #${checks}: ${alive.length} in DOM, ${active.length} active, adBreak=${isAdBreakActive()}`);
        this.dumpVideos(alive, `poll#${checks}`);
      }

      if (active.length >= 2 && isAdBreakActive()) {
        this.clearPendingCheck();
        this.log('Second active video appeared — activating swap');
        this.activateSwap(active);
      } else if (active.length >= 2 && !isAdBreakActive()) {
        // Videos ready but ad indicators not yet — switch to ad indicator wait
        this.clearPendingCheck();
        this.log('Videos active but no ad indicators yet — waiting');
        this.waitForAdIndicators(active);
      } else if (checks >= 30) {
        // 30 × 200ms = 6s — enough for slow networks
        this.clearPendingCheck();
        this.log('No second active video after 6s — not an ad');
      }
    }, 200);
  }

  /**
   * Two active videos exist (PbyP appeared) but ad DOM indicators haven't
   * shown up yet. Twitch adds the ad banner ~10s after the PbyP stream starts.
   * Poll for up to 20 seconds waiting for isAdBreakActive() to become true.
   */
  private waitForAdIndicators(activeVideos: HTMLVideoElement[]): void {
    let checks = 0;
    const MAX_CHECKS = 100; // 100 × 200ms = 20s
    this.pendingCheckVideoCount = activeVideos.length;
    this.log('Waiting for ad indicators (up to 20s)...');
    this.pendingCheckInterval = setInterval(() => {
      checks++;

      if (isAdBreakActive()) {
        this.clearPendingCheck();
        // Re-check which videos are still active
        const stillActive = activeVideos.filter(
          (v) => document.contains(v) && this.isActive(v),
        );
        if (stillActive.length >= 2) {
          this.log(`Ad indicators appeared after ${(checks * 0.2).toFixed(1)}s — activating swap`);
          this.activateSwap(stillActive);
        } else {
          this.log('Ad indicators appeared but videos changed — falling back to LiveAdHandler');
        }
        return;
      }

      // Check if the second video disappeared (no longer an ad scenario)
      const stillActive = activeVideos.filter(
        (v) => document.contains(v) && this.isActive(v),
      );
      if (stillActive.length < 2) {
        this.clearPendingCheck();
        this.log('Second video disappeared while waiting — not an ad');
        return;
      }

      if (checks >= MAX_CHECKS) {
        this.clearPendingCheck();
        this.log('No ad indicators after 20s — not an ad');
      }
    }, 200);
  }

  private clearPendingCheck(): void {
    if (this.pendingCheckInterval !== null) {
      clearInterval(this.pendingCheckInterval);
      this.pendingCheckInterval = null;
      this.pendingCheckVideoCount = 0;
    }
  }

  private activateSwap(activeVideos: HTMLVideoElement[]): void {
    // Identify: originalVideo = now playing ad, the other = sub-stream
    if (this.originalVideo && activeVideos.includes(this.originalVideo)) {
      this.adVideo = this.originalVideo;
      this.subVideo = activeVideos.find((v) => v !== this.originalVideo) ?? activeVideos[1];
    } else {
      // Fallback: identify by muted state (sub-stream is typically muted)
      const muted = activeVideos.find((v) => v.muted);
      const unmuted = activeVideos.find((v) => !v.muted);
      if (muted && unmuted) {
        this.adVideo = unmuted;
        this.subVideo = muted;
      } else {
        this.adVideo = activeVideos[0];
        this.subVideo = activeVideos[1];
      }
    }

    this.isSwapped = true;
    this.subVideoWasPlaying = false;
    this.swapCount++;

    this.log(
      `Swap ON — ad: ${this.adVideo.videoWidth}x${this.adVideo.videoHeight}, ` +
      `sub: ${this.subVideo.videoWidth}x${this.subVideo.videoHeight}`,
    );

    // Save original volume from the ad video (main player)
    this.savedVolume = this.adVideo.volume || 1;

    // Hide ad video
    this.adVideo.style.opacity = '0';
    this.adVideo.style.pointerEvents = 'none';
    this.adVideo.muted = true;

    // Move sub-video to document.body so it escapes any CSS clipping
    // from collapsed chat panel ancestors (overflow:hidden, transform, etc.)
    this.reparentSubVideo();

    // Position sub video over ad video
    this.positionSubVideo();

    // Unmute sub video and set volume
    this.subVideo.muted = false;
    this.subVideo.volume = this.savedVolume;

    // Polling: maintain audio state + detect ad end (sub-video paused)
    this.unmuteInterval = setInterval(() => {
      if (!this.subVideo || !this.isSwapped) return;

      // Keep ad video muted (Twitch player may un-mute it)
      if (this.adVideo && !this.adVideo.muted) {
        this.adVideo.muted = true;
      }
      if (this.adVideo && this.adVideo.volume > 0) {
        this.adVideo.volume = 0;
      }

      if (!this.subVideo.paused) {
        this.subVideoWasPlaying = true;
        this.subPausedTicks = 0;
      }

      if (this.subVideoWasPlaying && this.subVideo.paused) {
        if (!isAdBreakActive()) {
          // Sub-video paused AND ad indicators gone → ad really ended
          this.log('Sub-video paused + no ad indicators — ad ended');
          this.deactivateSwap();
          return;
        }
        // Ad still active but sub-video paused — give it time to resume
        this.subPausedTicks++;
        if (this.subPausedTicks === 1) {
          this.log('Sub-video paused mid-ad — waiting for resume');
          // Try to resume playback
          this.subVideo.play().catch(() => {});
        }
        // After ~3s (15 ticks × 200ms) give up and let LiveAdHandler take over
        if (this.subPausedTicks >= 15) {
          this.log('Sub-video stayed paused for 3s — deactivating swap');
          this.deactivateSwap();
          return;
        }
      }

      // Keep sub-video unmuted with correct volume
      if (this.subVideo.muted) {
        this.subVideo.muted = false;
      }
      if (this.subVideo.volume === 0) {
        this.subVideo.volume = this.savedVolume;
      }
    }, 200);

    // Reposition when ad video's size changes (covers window resize,
    // chat panel toggle, theater mode, and any other layout change)
    this.resizeObserver = new ResizeObserver(() => this.positionSubVideo());
    this.resizeObserver.observe(this.adVideo);

    // Notify page script to install muted/volume setter overrides.
    // Pass the sub-video's DOM index so the page script protects the correct element.
    const allVideos = Array.from(document.querySelectorAll('video'));
    const subIndex = allVideos.indexOf(this.subVideo);
    window.postMessage(
      { source: MESSAGE_SOURCE.CONTENT, type: 'swap-activate', data: { subVideoIndex: subIndex } },
      '*',
    );

    this.notifyStateChange();
  }

  /**
   * Move the sub-video to document.body so `position: fixed` is truly
   * viewport-relative and no ancestor can clip it (overflow:hidden,
   * transform containing blocks, etc.).
   */
  private reparentSubVideo(): void {
    if (!this.subVideo) return;
    this.subVideoOriginalParent = this.subVideo.parentNode;
    this.subVideoNextSibling = this.subVideo.nextSibling;
    document.body.appendChild(this.subVideo);
    this.log('Moved sub-video to document.body');
  }

  /**
   * Return the sub-video to its original DOM position so Twitch's
   * React tree stays consistent.
   */
  private restoreSubVideo(subVideo: HTMLVideoElement): void {
    const parent = this.subVideoOriginalParent;
    const sibling = this.subVideoNextSibling;
    this.subVideoOriginalParent = null;
    this.subVideoNextSibling = null;

    if (!parent || !document.contains(parent as Node)) return;

    if (sibling && parent.contains(sibling)) {
      parent.insertBefore(subVideo, sibling);
    } else {
      parent.appendChild(subVideo);
    }
    this.log('Restored sub-video to original parent');
  }

  private deactivateSwap(): void {
    // Guard against double-deactivation (unmuteInterval and DomObserver can race)
    if (!this.isSwapped) return;

    this.log('Swap OFF — restoring normal playback');

    if (this.unmuteInterval !== null) {
      clearInterval(this.unmuteInterval);
      this.unmuteInterval = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Notify page script FIRST to remove muted/volume overrides
    window.postMessage(
      { source: MESSAGE_SOURCE.CONTENT, type: 'swap-deactivate' },
      '*',
    );

    const adVideo = this.adVideo;
    const subVideo = this.subVideo;

    this.isSwapped = false;
    this.adVideo = null;
    this.subVideo = null;
    this.subVideoWasPlaying = false;
    this.subPausedTicks = 0;

    this.notifyStateChange();

    // Delay element restoration so the page script has time to remove overrides
    setTimeout(() => {
      if (subVideo) {
        subVideo.muted = true;
        subVideo.volume = 0;
        subVideo.style.removeProperty('position');
        subVideo.style.removeProperty('left');
        subVideo.style.removeProperty('top');
        subVideo.style.removeProperty('width');
        subVideo.style.removeProperty('height');
        subVideo.style.removeProperty('z-index');
        subVideo.style.removeProperty('object-fit');
        // Move back to original parent in the PbyP player
        this.restoreSubVideo(subVideo);
      }
      if (adVideo) {
        adVideo.style.removeProperty('opacity');
        adVideo.style.removeProperty('pointer-events');
        adVideo.muted = false;
      }
    }, 100);
  }

  private findFixedContainingBlock(el: HTMLElement): HTMLElement | null {
    let parent = el.parentElement;
    while (parent && parent !== document.documentElement) {
      const style = getComputedStyle(parent);
      if (
        style.transform !== 'none' ||
        style.perspective !== 'none' ||
        style.filter !== 'none' ||
        style.contain === 'paint' ||
        style.contain === 'layout' ||
        style.contain === 'strict' ||
        style.contain === 'content'
      ) {
        return parent;
      }
      parent = parent.parentElement;
    }
    return null;
  }

  private positionSubVideo(): void {
    if (!this.adVideo || !this.subVideo) return;

    const adRect = this.adVideo.getBoundingClientRect();

    const containingBlock = this.findFixedContainingBlock(this.subVideo);
    let offsetX = 0;
    let offsetY = 0;
    if (containingBlock) {
      const cbRect = containingBlock.getBoundingClientRect();
      offsetX = cbRect.left;
      offsetY = cbRect.top;
    }

    this.subVideo.style.position = 'fixed';
    this.subVideo.style.left = `${adRect.left - offsetX}px`;
    this.subVideo.style.top = `${adRect.top - offsetY}px`;
    this.subVideo.style.width = `${adRect.width}px`;
    this.subVideo.style.height = `${adRect.height}px`;
    this.subVideo.style.zIndex = '10000';
    this.subVideo.style.objectFit = 'contain';
  }
}
