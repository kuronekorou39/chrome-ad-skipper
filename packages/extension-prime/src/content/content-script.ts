import { PrimeAdHandler } from './prime-ad-handler';
import { setOverlayOpacity } from './skip-overlay';

const primeAdHandler = new PrimeAdHandler();

// Forward badge state to background
primeAdHandler.onStateChange((state) => {
  try {
    chrome.runtime.sendMessage({ type: 'badge-update', data: { state } }).catch(() => {});
  } catch (_) {}
});

// Load initial settings then start
chrome.storage.local.get(['overlayOpacity', 'pvAutoSkip'], (data) => {
  if (data.overlayOpacity !== undefined) {
    setOverlayOpacity(data.overlayOpacity);
  }
  if (data.pvAutoSkip !== undefined) {
    primeAdHandler.setAutoSkip(data.pvAutoSkip);
  }
  primeAdHandler.start();
});

// Listen for settings changes from popup
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes.overlayOpacity) {
    setOverlayOpacity(changes.overlayOpacity.newValue);
  }
  if (changes.pvAutoSkip) {
    primeAdHandler.setAutoSkip(changes.pvAutoSkip.newValue);
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'get-prime-status') {
    sendResponse({
      url: location.href,
      title: document.title,
      connected: true,
      prime: primeAdHandler.getStatus(),
    });
    return true;
  }

  if (message.type === 'set-auto-skip') {
    primeAdHandler.setAutoSkip(message.enabled);
    sendResponse({ ok: true });
    return true;
  }
});
