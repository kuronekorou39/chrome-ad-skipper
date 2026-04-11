import type {
  NetworkLogEntry,
  HlsPlaylist,
  VideoElementState,
  MediaSourceEvent,
  ExtensionMessage,
} from '@ad-skipper/shared';
import { Timeline } from './components/timeline';
import { SegmentTable } from './components/segment-table';
import { PlaylistViewer } from './components/playlist-viewer';
import { NetworkLog } from './components/network-log';
import { VideoState } from './components/video-state';

// State
let networkLogs: NetworkLogEntry[] = [];
let playlists: HlsPlaylist[] = [];
let videoStates: VideoElementState[] = [];
let mediaSourceEvents: MediaSourceEvent[] = [];

// Components
const timeline = new Timeline('timeline-canvas');
const segmentTable = new SegmentTable('segment-table');
const playlistViewer = new PlaylistViewer('playlist-raw', 'playlist-info');
const networkLog = new NetworkLog('network-table');
const videoState = new VideoState('video-states');

// Tab switching
document.querySelectorAll<HTMLButtonElement>('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelector('.tab.active')?.classList.remove('active');
    document.querySelector('.panel.active')?.classList.remove('active');
    tab.classList.add('active');
    const panelId = `panel-${tab.dataset.panel}`;
    document.getElementById(panelId)?.classList.add('active');
  });
});

// Clear button
document.getElementById('btn-clear')?.addEventListener('click', () => {
  networkLogs = [];
  playlists = [];
  videoStates = [];
  mediaSourceEvents = [];
  timeline.clear();
  segmentTable.clear();
  playlistViewer.clear();
  networkLog.clear();
  videoState.clear();
});

// Export button
document.getElementById('btn-export')?.addEventListener('click', () => {
  const data = { networkLogs, playlists, videoStates, mediaSourceEvents };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `twitch-hls-export-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// Connect to service worker
const tabId = chrome.devtools.inspectedWindow.tabId;
const port = chrome.runtime.connect({ name: 'twitch-hls-devtools' });
const statusEl = document.getElementById('status')!;

port.postMessage({ type: 'devtools-init', tabId });
statusEl.textContent = 'Connected';
statusEl.classList.add('connected');

port.onMessage.addListener((message: ExtensionMessage | { type: string; data: unknown }) => {
  switch (message.type) {
    case 'devtools-data': {
      // Initial data load
      const data = (
        message as {
          type: string;
          data: {
            networkLogs: NetworkLogEntry[];
            playlists: HlsPlaylist[];
            videoStates: VideoElementState[];
            mediaSourceEvents: MediaSourceEvent[];
          };
        }
      ).data;
      networkLogs = data.networkLogs;
      playlists = data.playlists;
      videoStates = data.videoStates;
      mediaSourceEvents = data.mediaSourceEvents;
      refreshAll();
      break;
    }

    case 'network-log': {
      const entry = (message as { data: NetworkLogEntry }).data;
      networkLogs.push(entry);
      networkLog.addEntry(entry);
      timeline.addEvent({ time: entry.startTime, type: entry.type, isAd: entry.isAd });
      break;
    }

    case 'playlist-update': {
      const { playlist } = (message as { data: { playlist: HlsPlaylist } }).data;
      playlists.push(playlist);
      playlistViewer.update(playlist);
      segmentTable.update(playlist);
      timeline.setAdState(playlist.adState, playlist.fetchedAt);
      break;
    }

    case 'video-state-update': {
      const { videos } = (message as { data: { videos: VideoElementState[] } }).data;
      videoStates = videos;
      videoState.update(videos);
      break;
    }

    case 'mediasource-update': {
      const { event } = (message as { data: { event: MediaSourceEvent } }).data;
      mediaSourceEvents.push(event);
      break;
    }

    case 'ad-detected': {
      const adData = (message as { data: { markers: unknown[]; timestamp: number } }).data;
      timeline.markAdEvent(adData.timestamp);
      break;
    }
  }
});

port.onDisconnect.addListener(() => {
  statusEl.textContent = 'Disconnected';
  statusEl.classList.remove('connected');
});

function refreshAll(): void {
  networkLog.setEntries(networkLogs);
  if (playlists.length > 0) {
    const latest = playlists[playlists.length - 1];
    playlistViewer.update(latest);
    segmentTable.update(latest);
  }
  videoState.update(videoStates);
  timeline.rebuild(networkLogs, playlists);
}
