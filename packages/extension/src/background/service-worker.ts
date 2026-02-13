import { setupWebRequestLogger } from './web-request-logger';
import { dataStore } from './data-store';
import { broadcastToDevTools, registerDevToolsPort, unregisterDevToolsPort } from './broadcast';

console.log('[Twitch HLS Inspector] Service Worker started');

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
      console.log(`[Twitch HLS Inspector] DevTools panel connected for tab ${tabId}`);

      dataStore.getAll(tabId).then((data) => {
        port.postMessage({ type: 'devtools-data', data });
      });
    }
  });

  port.onDisconnect.addListener(() => {
    if (tabId >= 0) {
      unregisterDevToolsPort(tabId);
      console.log(`[Twitch HLS Inspector] DevTools panel disconnected for tab ${tabId}`);
    }
  });
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.source !== 'twitch-swap') return;

  const tabId = sender.tab?.id ?? -1;
  dataStore.add(tabId, message);

  // Defer broadcast — direct forward from onMessage can drop messages
  setTimeout(() => broadcastToDevTools(tabId, message), 0);
});
