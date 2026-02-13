import { setupMediaSourceHook } from './mediasource-hook';
import { setupFetchHook } from './fetch-hook';
import { setupVideoHook } from './video-hook';

/**
 * MAIN world script — runs in the page's JavaScript context.
 * Can intercept/monkey-patch native APIs that the ISOLATED world cannot access.
 */
console.log('[Twitch HLS Inspector] Page script loaded (MAIN world)');

// Install hooks
setupMediaSourceHook();
setupFetchHook();
setupVideoHook();
