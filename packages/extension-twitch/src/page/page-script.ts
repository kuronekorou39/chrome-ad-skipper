import { setupMediaSourceHook } from './mediasource-hook';
import { setupFetchHook } from './fetch-hook';
import { setupVideoHook } from './video-hook';
import { setupPlaybackRateLock } from './playback-rate-lock';

/**
 * MAIN world script — runs in the page's JavaScript context.
 * Can intercept/monkey-patch native APIs that the ISOLATED world cannot access.
 */
// Install hooks
setupMediaSourceHook();
setupFetchHook();
setupVideoHook();
setupPlaybackRateLock();
