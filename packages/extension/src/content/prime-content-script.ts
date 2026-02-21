import { PrimeAdHandler } from './prime-ad-handler';

console.log('[広告スキッパー:Prime] Content script loaded');

const primeAdHandler = new PrimeAdHandler();

// Forward badge state to background
primeAdHandler.onStateChange((state) => {
  try {
    chrome.runtime.sendMessage({ type: 'badge-update', data: { state } }).catch(() => {});
  } catch (_) {}
});

primeAdHandler.start();

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'get-prime-status') {
    sendResponse({
      url: location.href,
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
