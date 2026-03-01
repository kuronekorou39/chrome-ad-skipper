import { MESSAGE_SOURCE } from '@twitch-swap/shared';

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

const MAX_LOG_ENTRIES = 20;

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
  /** Saved parent/sibling so we can restore the sub-video after swap */
  private subVideoOriginalParent: ParentNode | null = null;
  private subVideoNextSibling: Node | null = null;
  private videoCount = 0;
  private swapCount = 0;
  private eventLog: string[] = [];
  private stateCallbacks: SwapStateCallback[] = [];
  /** Polls newly appeared videos that may not have loaded yet */
  private pendingCheckInterval: ReturnType<typeof setInterval> | null = null;

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

  /** Check if Twitch is actually showing an ad break (DOM indicators). */
  private isAdBreakActive(): boolean {
    // Ad banner text ("right after this ad break")
    if (document.querySelector('[data-test-selector="ad-banner-default-text"]')) return true;
    if (document.querySelector('span.tw-c-text-overlay')) return true;
    // ax-overlay with active ad content (childElementCount > 2)
    const ax = document.querySelector('[data-a-target="ax-overlay"]');
    if (ax && ax.parentNode instanceof HTMLElement && ax.parentNode.childElementCount > 2) return true;
    return false;
  }

  onVideoElementsChanged(allVideos: HTMLVideoElement[]): void {
    if (!this.enabled) return;
    this.videoCount = allVideos.length;
    const active = allVideos.filter((v) => this.isActive(v));
    this.log(`Videos: ${allVideos.length} total, ${active.length} active`);

    // Continuously track the main player (the sole active video when not swapping)
    if (!this.isSwapped && active.length === 1) {
      this.originalVideo = active[0];
    }

    if (!this.isSwapped) {
      this.clearPendingCheck();
      if (active.length >= 2) {
        if (this.isAdBreakActive()) {
          this.activateSwap(active);
        } else {
          // Two videos but no ad DOM indicators — not a real ad break
          this.log('Two active videos but no ad indicators — skipping swap');
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
   * Poll for up to 3 seconds; if a second active video appears, activate swap.
   * If none appears, they're just empty placeholders — do nothing.
   */
  private waitForActiveVideos(allVideos: HTMLVideoElement[]): void {
    let checks = 0;
    this.pendingCheckInterval = setInterval(() => {
      checks++;
      const active = allVideos.filter(
        (v) => document.contains(v) && this.isActive(v),
      );
      if (active.length >= 2 && this.isAdBreakActive()) {
        this.clearPendingCheck();
        this.log('Second active video appeared — activating swap');
        this.activateSwap(active);
      } else if (active.length >= 2 && !this.isAdBreakActive()) {
        this.clearPendingCheck();
        this.log('Second active video but no ad indicators — skipping swap');
      } else if (checks >= 15) {
        this.clearPendingCheck();
        this.log('No second active video — not an ad');
      }
    }, 200);
  }

  private clearPendingCheck(): void {
    if (this.pendingCheckInterval !== null) {
      clearInterval(this.pendingCheckInterval);
      this.pendingCheckInterval = null;
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

    // Polling: maintain unmuted state + detect ad end (sub-video paused)
    this.unmuteInterval = setInterval(() => {
      if (!this.subVideo || !this.isSwapped) return;

      if (!this.subVideo.paused) {
        this.subVideoWasPlaying = true;
      }

      if (this.subVideoWasPlaying && this.subVideo.paused) {
        this.log('Sub-video paused — ad likely ended');
        this.deactivateSwap();
        return;
      }

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

    // Notify page script to install muted/volume setter overrides
    window.postMessage(
      { source: MESSAGE_SOURCE.CONTENT, type: 'swap-activate' },
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
