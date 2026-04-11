/**
 * MAIN world script — runs in YouTube's JavaScript context.
 * Can access YouTube's internal player API.
 */

/** YouTube's internal player API (undocumented, may change) */
interface YTPlayer extends HTMLElement {
  skipAd?: () => void;
  cancelPlayback?: () => void;
  finishAd?: () => void;
  exitAd?: () => void;
  getDuration?: () => number;
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo?: () => void;
  [key: string]: unknown;
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!event.data || event.data.source !== 'yt-ad-skipper') return;

  if (event.data.type === 'skip-ad') {
    skipAd();
  } else if (event.data.type === 'resume-playback') {
    resumePlayback();
  }
});

function getPlayer(): YTPlayer | null {
  return document.getElementById('movie_player') as YTPlayer | null;
}

function skipAd(): void {
  const player = getPlayer();

  // Method 1: Try known player API methods
  if (player) {
    for (const method of ['skipAd', 'cancelPlayback', 'finishAd', 'exitAd'] as const) {
      if (typeof player[method] === 'function') {
        try {
          (player[method] as () => void)();
          report('api-call', method);
          return;
        } catch {
          /* continue */
        }
      }
    }

    // Method 2: Seek via player API
    if (typeof player.getDuration === 'function' && typeof player.seekTo === 'function') {
      const duration = player.getDuration();
      if (duration && isFinite(duration)) {
        player.seekTo(duration - 0.1, true);
        report('api-seekTo', `${duration}`);
        return;
      }
    }
  }

  // Method 3: Seek the <video> element directly to end of ad
  const video = document.querySelector<HTMLVideoElement>('video');
  if (video && video.duration && isFinite(video.duration) && !video.paused) {
    video.currentTime = video.duration;
    report('video-seek', `${video.duration}`);
    return;
  }

  report('failed', 'no method worked');
}

/** Resume playback after ad skip — video may be paused/ended */
function resumePlayback(): void {
  const player = getPlayer();

  if (player && typeof player.playVideo === 'function') {
    player.playVideo();
    report('resume', 'playVideo()');
    return;
  }

  const video = document.querySelector<HTMLVideoElement>('video');
  if (video && video.paused) {
    video.play().catch(() => {});
    report('resume', 'video.play()');
    return;
  }

  report('resume', 'not needed (already playing)');
}

function report(type: string, detail: string): void {
  window.postMessage(
    {
      source: 'yt-ad-skipper-page',
      type: 'skip-result',
      method: type,
      detail,
    },
    '*',
  );
}
