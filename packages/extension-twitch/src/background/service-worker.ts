import { setupWebRequestLogger } from './web-request-logger';
import { dataStore } from './data-store';
import { broadcastToDevTools, registerDevToolsPort, unregisterDevToolsPort } from './broadcast';

// Initialize web request logging
setupWebRequestLogger();

// Listen for connections from DevTools panels
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'twitch-hls-devtools') return;

  let tabId = -1;

  port.onMessage.addListener((msg) => {
    if (msg.type === 'devtools-init') {
      tabId = msg.tabId;
      registerDevToolsPort(tabId, port);

      dataStore.getAll(tabId).then((data) => {
        port.postMessage({ type: 'devtools-data', data });
      });
    }
  });

  port.onDisconnect.addListener(() => {
    if (tabId >= 0) {
      unregisterDevToolsPort(tabId);
    }
  });
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender) => {
  const tabId = sender.tab?.id ?? -1;

  // Unified badge update from any content script
  if (message.type === 'badge-update' && tabId >= 0) {
    updateBadge(tabId, message.data.state);
    return;
  }

  if (message.source !== 'twitch-swap') return;

  dataStore.add(tabId, message);

  // Defer broadcast — direct forward from onMessage can drop messages
  setTimeout(() => broadcastToDevTools(tabId, message), 0);
});

// Clear badge when navigating away from Twitch
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    if (!changeInfo.url.includes('twitch.tv')) {
      chrome.action.setBadgeText({ text: '', tabId });
    }
  }
});

/** Update the extension icon badge to reflect current state */
function updateBadge(tabId: number, state: 'on' | 'ad' | 'off'): void {
  switch (state) {
    case 'on':
      chrome.action.setBadgeText({ text: 'ON', tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#2ecc71', tabId });
      break;
    case 'ad':
      chrome.action.setBadgeText({ text: 'AD', tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#f1c40f', tabId });
      break;
    case 'off':
      chrome.action.setBadgeText({ text: 'OFF', tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#888888', tabId });
      break;
  }
}
