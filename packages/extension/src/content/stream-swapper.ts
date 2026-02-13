import { MESSAGE_SOURCE } from '@twitch-swap/shared';

/**
 * Swaps the sub-stream over the ad during Twitch ad breaks.
 *
 * Detection:
 *   - Ad start:  video element count 1→2
 *   - Ad end:    video element count 2→1, OR sub-video becomes paused
 *
 * Identification:
 *   - Track the original video element (the one present before the ad).
 *   - When a 2nd video appears, the ORIGINAL is now playing the ad,
 *     and the NEW element is the sub-stream (main content at low quality).
 */
export class StreamSwapper {
  private isSwapped = false;
  /** The video element that existed before the ad started */
  private originalVideo: HTMLVideoElement | null = null;
  private adVideo: HTMLVideoElement | null = null;
  private subVideo: HTMLVideoElement | null = null;
  private savedVolume = 1;
  private unmuteInterval: ReturnType<typeof setInterval> | null = null;
  private resizeHandler: (() => void) | null = null;
  private subVideoWasPlaying = false;

  onVideoElementsChanged(videos: HTMLVideoElement[]): void {
    console.log(`[StreamSwapper] Video count changed: ${videos.length}`);

    // Track the single video element before ads start
    if (videos.length === 1 && !this.isSwapped) {
      this.originalVideo = videos[0];
    }

    if (!this.isSwapped && videos.length >= 2) {
      this.activateSwap(videos);
    } else if (this.isSwapped && videos.length <= 1) {
      this.deactivateSwap();
    }
  }

  private activateSwap(videos: HTMLVideoElement[]): void {
    // Identify: original video = now playing ad, new video = sub-stream
    if (this.originalVideo && videos.includes(this.originalVideo)) {
      this.adVideo = this.originalVideo;
      this.subVideo = videos.find((v) => v !== this.originalVideo) ?? videos[1];
    } else {
      // Fallback: identify by muted state (sub-stream is typically muted)
      const muted = videos.find((v) => v.muted);
      const unmuted = videos.find((v) => !v.muted);
      if (muted && unmuted) {
        this.adVideo = unmuted; // ad plays with audio on the original player
        this.subVideo = muted;  // sub-stream appears muted
      } else {
        this.adVideo = videos[0];
        this.subVideo = videos[1];
      }
    }

    this.isSwapped = true;
    this.subVideoWasPlaying = false;

    console.log(
      '[StreamSwapper] Activating swap — ad: %o (%dx%d, muted=%s), sub: %o (%dx%d, muted=%s)',
      this.adVideo,
      this.adVideo.videoWidth,
      this.adVideo.videoHeight,
      this.adVideo.muted,
      this.subVideo,
      this.subVideo.videoWidth,
      this.subVideo.videoHeight,
      this.subVideo.muted,
    );

    // Save original volume from the ad video (main player)
    this.savedVolume = this.adVideo.volume || 1;

    // Hide ad video
    this.adVideo.style.opacity = '0';
    this.adVideo.style.pointerEvents = 'none';
    this.adVideo.muted = true;

    // Position sub video over ad video
    this.positionSubVideo();

    // Unmute sub video and set volume
    this.subVideo.muted = false;
    this.subVideo.volume = this.savedVolume;

    // Polling: maintain unmuted state + detect ad end (sub-video paused)
    this.unmuteInterval = setInterval(() => {
      if (!this.subVideo || !this.isSwapped) return;

      // Track if sub-video has been playing
      if (!this.subVideo.paused) {
        this.subVideoWasPlaying = true;
      }

      // If sub-video was playing but is now paused → ad ended
      if (this.subVideoWasPlaying && this.subVideo.paused) {
        console.log('[StreamSwapper] Sub-video paused — ad likely ended');
        this.deactivateSwap();
        return;
      }

      // Maintain unmuted state (Twitch may re-mute)
      if (this.subVideo.muted) {
        this.subVideo.muted = false;
      }
      if (this.subVideo.volume === 0) {
        this.subVideo.volume = this.savedVolume;
      }
    }, 200);

    // Reposition on window resize
    this.resizeHandler = () => this.positionSubVideo();
    window.addEventListener('resize', this.resizeHandler);

    // Notify page script to install muted/volume setter overrides
    window.postMessage(
      { source: MESSAGE_SOURCE.CONTENT, type: 'swap-activate' },
      '*',
    );
  }

  private deactivateSwap(): void {
    console.log('[StreamSwapper] Ad ended — deactivating swap');

    // Restore ad video
    if (this.adVideo) {
      this.adVideo.style.removeProperty('opacity');
      this.adVideo.style.removeProperty('pointer-events');
      this.adVideo.muted = false;
    }

    // Restore sub video styles (it may already be removed from DOM)
    if (this.subVideo) {
      this.subVideo.style.removeProperty('position');
      this.subVideo.style.removeProperty('left');
      this.subVideo.style.removeProperty('top');
      this.subVideo.style.removeProperty('width');
      this.subVideo.style.removeProperty('height');
      this.subVideo.style.removeProperty('z-index');
      this.subVideo.style.removeProperty('object-fit');
    }

    // Clear interval
    if (this.unmuteInterval !== null) {
      clearInterval(this.unmuteInterval);
      this.unmuteInterval = null;
    }

    // Remove resize listener
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }

    // Notify page script to remove overrides
    window.postMessage(
      { source: MESSAGE_SOURCE.CONTENT, type: 'swap-deactivate' },
      '*',
    );

    this.isSwapped = false;
    this.adVideo = null;
    this.subVideo = null;
    this.subVideoWasPlaying = false;
  }

  /**
   * Find the nearest ancestor that creates a containing block for position:fixed.
   * An ancestor with transform, perspective, filter, or contain creates
   * a new containing block, making position:fixed relative to it instead of viewport.
   */
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

    // If an ancestor has transform/filter/etc, position:fixed is relative to
    // that ancestor, not the viewport. Subtract its offset to compensate.
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
