chrome.runtime.onMessage.addListener((message, sender) => {
  const tabId = sender.tab?.id ?? -1;
  if (message.type === 'badge-update' && tabId >= 0) {
    updateBadge(tabId, message.data.state);
  }
});

// Clear badge when navigating away from Prime Video
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    const url = changeInfo.url;
    const isSupported = url.includes('amazon.co') || url.includes('amazon.com') || url.includes('primevideo.com');
    if (!isSupported) {
      chrome.action.setBadgeText({ text: '', tabId });
    }
  }
});

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
