import { MESSAGE_SOURCE } from '@twitch-swap/shared';
import type { PageMessage, ExtVideoStateUpdate, ExtMediaSourceUpdate } from '@twitch-swap/shared';
import { DomObserver } from './dom-observer';
import { VideoTracker } from './video-tracker';
import { Bridge } from './bridge';

console.log('[Twitch HLS Inspector] Content script loaded');

/** Safely send a message to the background. Stops polling if context is dead. */
function safeSendMessage(msg: unknown): void {
  try {
    chrome.runtime.sendMessage(msg).catch((err) => {
      console.warn('[HLS Inspector] sendMessage rejected:', err?.message);
    });
  } catch (err) {
    console.error('[HLS Inspector] sendMessage threw:', (err as Error)?.message);
    // Only stop if context is truly invalidated
    if ((err as Error)?.message?.includes('Extension context invalidated')) {
      videoTracker.stopPolling();
      domObserver.stop();
    }
  }
}

// Set up bridge to receive messages from page script (MAIN world)
const bridge = new Bridge();

bridge.onMessage((msg: PageMessage) => {
  switch (msg.type) {
    case 'mediasource-event': {
      const extMsg: ExtMediaSourceUpdate = {
        source: MESSAGE_SOURCE.EXTENSION,
        type: 'mediasource-update',
        data: {
          tabId: -1,
          event: msg.data,
        },
      };
      safeSendMessage(extMsg);
      break;
    }

    case 'fetch-intercept':
      console.log('[HLS Inspector] Fetch intercepted:', msg.data.url);
      break;

    case 'video-event':
      console.log('[HLS Inspector] Video event:', msg.data.event, msg.data.src);
      break;
  }
});

// Set up DOM observer to watch for video elements
const domObserver = new DomObserver();

// Set up video tracker
const videoTracker = new VideoTracker();

// When DOM observer finds video elements, track them
domObserver.onVideoElementsChanged((videos) => {
  videoTracker.updateElements(videos);
});

// When video tracker has state updates, send to background
videoTracker.onStateUpdate((states) => {
  console.log(`[HLS Inspector] Video states: ${states.length} elements`);
  const msg: ExtVideoStateUpdate = {
    source: MESSAGE_SOURCE.EXTENSION,
    type: 'video-state-update',
    data: {
      tabId: -1,
      videos: states,
      timestamp: Date.now(),
    },
  };
  safeSendMessage(msg);
});

// Start observing
domObserver.start();
videoTracker.startPolling();
