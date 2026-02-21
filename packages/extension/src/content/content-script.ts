import { MESSAGE_SOURCE } from '@twitch-swap/shared';
import type { PageMessage, ExtVideoStateUpdate, ExtMediaSourceUpdate } from '@twitch-swap/shared';
import { DomObserver } from './dom-observer';
import { VideoTracker } from './video-tracker';
import { Bridge } from './bridge';
import { StreamSwapper } from './stream-swapper';
import { PointsClaimer } from './points-claimer';
import { VodAdHandler } from './vod-ad-handler';
import { ChatKeeper } from './chat-keeper';

console.log('[広告スキッパー:Twitch] Content script loaded');

/** Safely send a message to the background. Stops polling if context is dead. */
function safeSendMessage(msg: unknown): void {
  try {
    chrome.runtime.sendMessage(msg).catch((err) => {
      console.warn('[広告スキッパー:Twitch] sendMessage rejected:', err?.message);
    });
  } catch (err) {
    console.error('[広告スキッパー:Twitch] sendMessage threw:', (err as Error)?.message);
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
      console.log('[広告スキッパー:Twitch] Fetch intercepted:', msg.data.url);
      break;

    case 'video-event':
      console.log('[広告スキッパー:Twitch] Video event:', msg.data.event, msg.data.src);
      break;
  }
});

// Set up DOM observer to watch for video elements
const domObserver = new DomObserver();

// Set up video tracker
const videoTracker = new VideoTracker();

// Set up stream swapper for ad bypass
const streamSwapper = new StreamSwapper();

// Notify background of swap state changes (for badge + devtools)
streamSwapper.onStateChange((state) => {
  safeSendMessage({
    source: MESSAGE_SOURCE.EXTENSION,
    type: 'swap-state-changed',
    data: { state },
  });
  // Badge update
  safeSendMessage({
    type: 'badge-update',
    data: { state: state === 'swapping' ? 'ad' : 'on' },
  });
});

// Initial badge: content script loaded, monitoring
safeSendMessage({ type: 'badge-update', data: { state: 'on' } });

// When DOM observer finds video elements, track them and check for swap
domObserver.onVideoElementsChanged((videos) => {
  videoTracker.updateElements(videos);
  streamSwapper.onVideoElementsChanged(videos);
});

// When video tracker has state updates, send to background
videoTracker.onStateUpdate((states) => {
  console.log(`[広告スキッパー:Twitch] Video states: ${states.length} elements`);
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

// Set up auto points claimer
const pointsClaimer = new PointsClaimer();

// Set up VOD ad handler (mute + fast-forward)
const vodAdHandler = new VodAdHandler();

// Keep chat open in the background so PbyP player stays available for swap
const chatKeeper = new ChatKeeper();

// Handle status queries from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'get-swap-status') {
    sendResponse({
      url: location.href,
      connected: true,
      swap: streamSwapper.getStatus(),
      points: pointsClaimer.getStatus(),
      vodAd: vodAdHandler.getStatus(),
    });
    return true;
  }
});

// Start observing
domObserver.start();
videoTracker.startPolling();
pointsClaimer.start();
vodAdHandler.start();
chatKeeper.start();
