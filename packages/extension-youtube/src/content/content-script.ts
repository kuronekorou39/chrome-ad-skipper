import { YouTubeAdHandler } from './youtube-ad-handler';
import { setOverlayOpacity } from '@ad-skipper/shared';

const ytAdHandler = new YouTubeAdHandler();

// Forward badge state to background
ytAdHandler.onStateChange((state) => {
  try {
    chrome.runtime.sendMessage({ type: 'badge-update', data: { state } }).catch(() => {});
  } catch {
    // Extension context may be invalidated
  }
});

// Load initial settings then start
chrome.storage.local.get(['overlayOpacity', 'ytAutoSkip'], (data) => {
  if (data.overlayOpacity !== undefined) {
    setOverlayOpacity(data.overlayOpacity);
  }
  if (data.ytAutoSkip !== undefined) {
    ytAdHandler.setAutoSkip(data.ytAutoSkip);
  }
  ytAdHandler.start();
});

// Listen for settings changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes.overlayOpacity) {
    setOverlayOpacity(changes.overlayOpacity.newValue);
  }
  if (changes.ytAutoSkip) {
    ytAdHandler.setAutoSkip(changes.ytAutoSkip.newValue);
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'get-youtube-status') {
    sendResponse({
      url: location.href,
      title: document.title,
      connected: true,
      youtube: ytAdHandler.getStatus(),
    });
    return true;
  }

  if (message.type === 'set-auto-skip') {
    ytAdHandler.setAutoSkip(message.enabled);
    sendResponse({ ok: true });
    return true;
  }
});
