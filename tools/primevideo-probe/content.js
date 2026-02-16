/**
 * Prime Video Ad Probe — Content Script (v3)
 *
 * Detection: [class*="atvwebplayersdk-ad"] overlay visible = ad playing
 * Action: speed up ANY playing video during ad, regardless of DRM status.
 * Restore to 1x when ad overlay disappears.
 */

const POLL_INTERVAL = 500;
const AD_PLAYBACK_RATE = 16;
const MAX_SNAPSHOTS = 50;
const MAX_LOG = 30;

const AD_OVERLAY_SELECTOR = '[class*="atvwebplayersdk-ad"]';

let snapshots = [];
let lastStateKey = '';
let eventLog = [];
let autoSkipEnabled = true;
let isAdPlaying = false;
let adSkipCount = 0;
/** Save original mute/volume state so we can restore after ad */
let savedMuted = false;
let savedVolume = 1;

function log(msg) {
  const time = new Date().toLocaleTimeString('ja-JP', { hour12: false });
  eventLog.push(`[${time}] ${msg}`);
  if (eventLog.length > MAX_LOG) eventLog.shift();
  console.log(`[PV-Probe] ${msg}`);
}

/**
 * Check if the ad overlay is visible on the page.
 */
function isAdOverlayVisible() {
  const overlays = document.querySelectorAll(AD_OVERLAY_SELECTOR);
  for (const el of overlays) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return true;
  }
  return false;
}

/**
 * Find the actively playing video (the one showing on screen).
 * This could be the ad video OR content video — during ads,
 * whichever is playing IS the ad.
 */
function findPlayingVideo() {
  const videos = document.querySelectorAll('video');
  for (const v of videos) {
    if (v.paused) continue;
    if (v.videoWidth === 0) continue;
    return v;
  }
  return null;
}

/**
 * Main check loop
 */
function check() {
  const adVisible = isAdOverlayVisible();
  const playingVideo = findPlayingVideo();

  if (adVisible && autoSkipEnabled) {
    // --- AD PLAYING ---
    if (!isAdPlaying) {
      isAdPlaying = true;
      adSkipCount++;
      // Save audio state before muting
      if (playingVideo) {
        savedMuted = playingVideo.muted;
        savedVolume = playingVideo.volume;
      }
      log(`Ad #${adSkipCount} detected — applying ${AD_PLAYBACK_RATE}x + mute`);
    }

    // Speed up + mute whatever is playing (ad video or content-as-ad)
    if (playingVideo) {
      if (playingVideo.playbackRate !== AD_PLAYBACK_RATE) {
        playingVideo.playbackRate = AD_PLAYBACK_RATE;
      }
      if (!playingVideo.muted) playingVideo.muted = true;
      if (playingVideo.volume > 0) playingVideo.volume = 0;
    }
  } else if (isAdPlaying && !adVisible) {
    // --- AD ENDED ---
    isAdPlaying = false;
    log(`Ad #${adSkipCount} finished — restoring 1x`);

    // Restore ALL videos to normal
    const videos = document.querySelectorAll('video');
    videos.forEach(v => {
      if (v.playbackRate !== 1) v.playbackRate = 1;
      v.muted = savedMuted;
      v.volume = savedVolume;
    });
  }

  takeSnapshot(adVisible);
}

function analyzeVideo(video, index) {
  return {
    index,
    src: video.src || '(MSE/EME)',
    readyState: video.readyState,
    paused: video.paused,
    muted: video.muted,
    volume: video.volume,
    duration: video.duration,
    currentTime: video.currentTime,
    playbackRate: video.playbackRate,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    hasDRM: !!video.mediaKeys,
  };
}

function takeSnapshot(adVisible) {
  const videos = document.querySelectorAll('video');
  const stateKey = JSON.stringify({
    count: videos.length,
    ad: adVisible,
    isAd: isAdPlaying,
    rates: Array.from(videos).map(v => v.playbackRate),
    skips: adSkipCount,
  });

  if (stateKey === lastStateKey) return;
  lastStateKey = stateKey;

  const snapshot = {
    time: new Date().toLocaleTimeString('ja-JP', { hour12: false }),
    videoCount: videos.length,
    adDetected: adVisible,
    isAdPlaying,
    adSkipCount,
    videos: Array.from(videos).map((v, i) => analyzeVideo(v, i)),
  };

  snapshots.push(snapshot);
  if (snapshots.length > MAX_SNAPSHOTS) snapshots.shift();
  chrome.storage.local.set({ pvProbeSnapshots: snapshots });
}

// Start
log('Started on ' + location.href.split('?')[0]);
chrome.storage.local.get(['pvProbeSnapshots', 'pvAutoSkip'], (data) => {
  if (data.pvProbeSnapshots) snapshots = data.pvProbeSnapshots;
  if (data.pvAutoSkip !== undefined) autoSkipEnabled = data.pvAutoSkip;
  log(`Auto-skip: ${autoSkipEnabled ? 'ON' : 'OFF'}`);
});

setInterval(() => {
  try { check(); } catch (e) { log('Error: ' + e.message); }
}, POLL_INTERVAL);

// Message handler
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'get-live-state') {
    const videos = document.querySelectorAll('video');
    sendResponse({
      url: location.href,
      videoCount: videos.length,
      videos: Array.from(videos).map((v, i) => analyzeVideo(v, i)),
      adDetected: isAdOverlayVisible(),
      isAdPlaying,
      adSkipCount,
      autoSkipEnabled,
      eventLog: [...eventLog],
    });
    return true;
  }
  if (msg.type === 'set-auto-skip') {
    autoSkipEnabled = msg.enabled;
    chrome.storage.local.set({ pvAutoSkip: autoSkipEnabled });
    log(`Auto-skip: ${autoSkipEnabled ? 'ON' : 'OFF'}`);
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'clear-snapshots') {
    snapshots = [];
    lastStateKey = '';
    eventLog = [];
    adSkipCount = 0;
    chrome.storage.local.set({ pvProbeSnapshots: [] });
    sendResponse({ ok: true });
    return true;
  }
});
