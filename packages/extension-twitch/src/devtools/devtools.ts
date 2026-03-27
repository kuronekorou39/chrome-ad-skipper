// Create a DevTools panel for Twitch HLS inspection
chrome.devtools.panels.create(
  'Twitch HLS',
  '',
  'devtools/panel/panel.html',
  (panel) => {
    console.log('[Twitch HLS Inspector] DevTools panel created');
  }
);
