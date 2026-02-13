const summaryEl = document.getElementById('summary')!;

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (!tab?.url?.includes('twitch.tv')) {
    summaryEl.textContent = 'Navigate to a Twitch page to start monitoring.';
    return;
  }
  summaryEl.innerHTML = `
    <div>Monitoring: <span style="color:#2ecc71">${tab.url}</span></div>
    <div style="margin-top:6px;color:#888">Open DevTools (F12) → Twitch HLS tab for full dashboard.</div>
  `;
});
