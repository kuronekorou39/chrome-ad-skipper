import { MESSAGE_SOURCE } from '@ad-skipper/shared';

/**
 * MAIN world module that locks video.playbackRate during ad breaks.
 *
 * Twitch's player continuously resets playbackRate to 1.  By overriding
 * the property on the element instance with Object.defineProperty, we
 * block those resets while the lock is active.
 */

const originalDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate')!;

let lockedVideo: HTMLVideoElement | null = null;

function findMainVideo(): HTMLVideoElement | null {
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('video'));
  for (const v of videos) {
    if (v.readyState > 0 && v.videoWidth > 0) return v;
  }
  return null;
}

function lockRate(rate: number): void {
  const video = findMainVideo();
  if (!video) return;

  // Set actual internal rate via prototype setter
  originalDesc.set!.call(video, rate);

  // Override the instance property so Twitch's writes are silently ignored
  Object.defineProperty(video, 'playbackRate', {
    get() {
      return originalDesc.get!.call(video);
    },
    set(_v: number) {
      /* blocked during ad */
    },
    configurable: true,
  });

  lockedVideo = video;
}

function unlockRate(): void {
  if (!lockedVideo) return;
  // Remove instance override → prototype getter/setter restored
  delete (lockedVideo as any).playbackRate;
  lockedVideo.playbackRate = 1;
  lockedVideo = null;
}

export function setupPlaybackRateLock(): void {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== MESSAGE_SOURCE.CONTENT) return;

    if (data.type === 'lock-playback-rate') {
      lockRate(data.data?.rate ?? 2);
    } else if (data.type === 'unlock-playback-rate') {
      unlockRate();
    }
  });
}
