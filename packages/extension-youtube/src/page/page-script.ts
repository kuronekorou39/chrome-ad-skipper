/**
 * MAIN world script — runs in YouTube's JavaScript context.
 * Can access YouTube's internal player API.
 */

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!event.data || event.data.source !== 'yt-ad-skipper') return;

  if (event.data.type === 'skip-ad') {
    skipAd();
  } else if (event.data.type === 'resume-playback') {
    resumePlayback();
  } else if (event.data.type === 'dump-player-api') {
    dumpPlayerApi();
  }
});

function skipAd(): void {
  const player = document.getElementById('movie_player') as any;

  // Method 1: Try known player API methods
  if (player) {
    // Try skipAd variants
    for (const method of ['skipAd', 'cancelPlayback', 'finishAd', 'exitAd']) {
      if (typeof player[method] === 'function') {
        try {
          player[method]();
          report('api-call', method);
          return;
        } catch { /* continue */ }
      }
    }

    // Try seeking via player API
    if (typeof player.getDuration === 'function' && typeof player.seekTo === 'function') {
      const duration = player.getDuration();
      if (duration && isFinite(duration)) {
        player.seekTo(duration - 0.1, true);
        report('api-seekTo', `${duration}`);
        return;
      }
    }
  }

  // Method 2: Seek the <video> element directly to end of ad
  const video = document.querySelector<HTMLVideoElement>('video');
  if (video && video.duration && isFinite(video.duration) && !video.paused) {
    video.currentTime = video.duration;
    report('video-seek', `${video.duration}`);
    return;
  }

  report('failed', 'no method worked');
}

function dumpPlayerApi(): void {
  const player = document.getElementById('movie_player') as any;
  if (!player) {
    report('dump', 'player not found');
    return;
  }

  // Find all methods that look ad-related
  const methods: string[] = [];
  for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(player))) {
    if (typeof player[key] === 'function') {
      const lower = key.toLowerCase();
      if (lower.includes('ad') || lower.includes('skip') || lower.includes('seek')
          || lower.includes('duration') || lower.includes('playback')
          || lower.includes('video') || lower.includes('state')) {
        methods.push(key);
      }
    }
  }

  // Also check own properties
  for (const key of Object.keys(player)) {
    if (typeof player[key] === 'function') {
      const lower = key.toLowerCase();
      if (lower.includes('ad') || lower.includes('skip')) {
        if (!methods.includes(key)) methods.push(key);
      }
    }
  }

  report('dump', methods.join(', ') || '(no ad-related methods found)');

  // Also report current video state
  const video = document.querySelector<HTMLVideoElement>('video');
  if (video) {
    report('video-state',
      `currentTime=${video.currentTime.toFixed(1)}, ` +
      `duration=${video.duration}, ` +
      `paused=${video.paused}, ` +
      `playbackRate=${video.playbackRate}`
    );
  }
}

/** Resume playback after ad skip — video may be paused/ended */
function resumePlayback(): void {
  const player = document.getElementById('movie_player') as any;

  // Try player API first
  if (player && typeof player.playVideo === 'function') {
    player.playVideo();
    report('resume', 'playVideo()');
    return;
  }

  // Fallback: direct video.play()
  const video = document.querySelector<HTMLVideoElement>('video');
  if (video && video.paused) {
    video.play().catch(() => {});
    report('resume', 'video.play()');
    return;
  }

  report('resume', 'not needed (already playing)');
}

function report(type: string, detail: string): void {
  window.postMessage({
    source: 'yt-ad-skipper-page',
    type: 'skip-result',
    method: type,
    detail,
  }, '*');
}
