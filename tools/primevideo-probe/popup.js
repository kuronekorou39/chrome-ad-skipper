const statusBar = document.getElementById('status-bar');
const statusText = document.getElementById('status-text');
const videosDiv = document.getElementById('videos');
const logArea = document.getElementById('log-area');
const snapshotsDiv = document.getElementById('snapshots');
const noPage = document.getElementById('no-page');
const toggleBtn = document.getElementById('btn-toggle');

function fmt(n) {
  if (n === undefined || n === null || !isFinite(n)) return '?';
  return n.toFixed(1);
}

function renderVideos(videos) {
  if (!videos || videos.length === 0) return '<div style="color:#888">No videos</div>';
  return videos.map(v => {
    const drm = v.hasDRM
      ? '<span class="drm">DRM</span>'
      : '<span class="no-drm">NoDRM</span>';
    const state = v.paused ? '⏸' : '▶';
    const size = v.videoWidth > 0 ? `${v.videoWidth}x${v.videoHeight}` : '0x0';
    return `<div class="video-row">
      <span class="label">#${v.index} ${size}</span>
      ${drm}
      <span>${state} ${fmt(v.currentTime)}/${fmt(v.duration)}s</span>
      <span>Rate: <b>${v.playbackRate}x</b></span>
      <span>${v.muted ? '🔇' : '🔊'}</span>
    </div>`;
  }).join('');
}

function renderLog(entries) {
  if (!entries || entries.length === 0) return '<div class="log-line" style="color:#888">No events yet</div>';
  return entries.slice().reverse().map(line => {
    const isAd = line.includes('Ad #') || line.includes('detected');
    return `<div class="log-line ${isAd ? 'ad' : ''}">${line}</div>`;
  }).join('');
}

function renderSnapshots(snaps) {
  if (!snaps || snaps.length === 0) return '<div style="color:#888">No state changes</div>';
  return snaps.slice().reverse().slice(0, 20).map(s => {
    return `<div class="snapshot ${s.adDetected ? 'has-ad' : ''}">
      <b>${s.time}</b> — ${s.videoCount} video(s)
      ${s.adDetected ? '<span class="badge badge-ad">AD</span>' : ''}
      Skipped: ${s.adSkipCount}
      ${s.videos.map(v => `<span style="margin-left:6px">#${v.index}:${v.playbackRate}x${v.hasDRM ? '🔒' : ''}</span>`).join('')}
    </div>`;
  }).join('');
}

async function getTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function refresh() {
  const tab = await getTab();
  if (!tab || (!tab.url?.includes('amazon') && !tab.url?.includes('primevideo'))) {
    noPage.style.display = 'block';
    statusBar.className = 'status-bar idle';
    statusText.textContent = 'Not on Prime Video';
    return;
  }
  noPage.style.display = 'none';

  try {
    const r = await chrome.tabs.sendMessage(tab.id, { type: 'get-live-state' });
    if (!r) return;

    // Status bar
    if (r.isAdPlaying) {
      statusBar.className = 'status-bar ad';
      statusText.innerHTML = `<span class="badge badge-ad">AD</span> 広告を${r.autoSkipEnabled ? '16x倍速中' : '検出中（スキップOFF）'}... (計${r.adSkipCount}回)`;
    } else {
      statusBar.className = 'status-bar idle';
      statusText.innerHTML = `<span class="badge badge-idle">通常</span> 本編再生中 (広告スキップ: ${r.adSkipCount}回)`;
    }

    // Toggle button
    toggleBtn.textContent = `Auto-Skip: ${r.autoSkipEnabled ? 'ON' : 'OFF'}`;
    toggleBtn.className = r.autoSkipEnabled ? 'on' : 'off';

    // Videos
    videosDiv.innerHTML = renderVideos(r.videos);

    // Log
    logArea.innerHTML = renderLog(r.eventLog);

  } catch (e) {
    statusText.textContent = 'Error: ' + e.message;
  }

  // Snapshots from storage
  const data = await chrome.storage.local.get('pvProbeSnapshots');
  snapshotsDiv.innerHTML = renderSnapshots(data.pvProbeSnapshots);
}

// Toggle auto-skip
toggleBtn.addEventListener('click', async () => {
  const tab = await getTab();
  if (!tab) return;
  try {
    const r = await chrome.tabs.sendMessage(tab.id, { type: 'get-live-state' });
    const newState = !r.autoSkipEnabled;
    await chrome.tabs.sendMessage(tab.id, { type: 'set-auto-skip', enabled: newState });
    refresh();
  } catch (_) {}
});

document.getElementById('btn-refresh').addEventListener('click', refresh);

document.getElementById('btn-clear').addEventListener('click', async () => {
  const tab = await getTab();
  if (tab) {
    try { await chrome.tabs.sendMessage(tab.id, { type: 'clear-snapshots' }); } catch (_) {}
  }
  refresh();
});

// Initial + auto-refresh
refresh();
setInterval(refresh, 1500);
