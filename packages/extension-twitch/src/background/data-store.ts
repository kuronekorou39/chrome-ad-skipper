import type {
  NetworkLogEntry,
  HlsPlaylist,
  VideoElementState,
  MediaSourceEvent,
  ExtensionMessage,
} from '@ad-skipper/shared';
import { STORAGE_LIMITS } from '@ad-skipper/shared';

interface TabData {
  networkLogs: NetworkLogEntry[];
  playlists: HlsPlaylist[];
  videoStates: VideoElementState[];
  mediaSourceEvents: MediaSourceEvent[];
}

/**
 * In-memory data store for HLS monitoring data, organized per tab.
 * Also persists summaries to chrome.storage.local for export.
 */
class DataStore {
  private tabs = new Map<number, TabData>();

  private getTab(tabId: number): TabData {
    let data = this.tabs.get(tabId);
    if (!data) {
      data = {
        networkLogs: [],
        playlists: [],
        videoStates: [],
        mediaSourceEvents: [],
      };
      this.tabs.set(tabId, data);
    }
    return data;
  }

  /** Add data from an extension message */
  add(tabId: number, message: ExtensionMessage): void {
    const tab = this.getTab(tabId);

    switch (message.type) {
      case 'network-log':
        tab.networkLogs.push(message.data);
        if (tab.networkLogs.length > STORAGE_LIMITS.NETWORK_LOGS) {
          tab.networkLogs.shift();
        }
        break;

      case 'playlist-update':
        tab.playlists.push(message.data.playlist);
        if (tab.playlists.length > STORAGE_LIMITS.PLAYLISTS) {
          tab.playlists.shift();
        }
        break;

      case 'video-state-update':
        // Replace all video states for this tab
        tab.videoStates = message.data.videos;
        break;

      case 'mediasource-update':
        tab.mediaSourceEvents.push(message.data.event);
        if (tab.mediaSourceEvents.length > STORAGE_LIMITS.MEDIA_SOURCE_EVENTS) {
          tab.mediaSourceEvents.shift();
        }
        break;

      case 'ad-detected':
        // Ad detection is derived from playlists, no separate storage needed
        break;
    }
  }

  /** Get all data for a tab */
  async getAll(tabId: number): Promise<TabData> {
    return this.getTab(tabId);
  }

  /** Export all data for a tab as JSON */
  async exportJson(tabId: number): Promise<string> {
    const data = this.getTab(tabId);
    return JSON.stringify(data, null, 2);
  }

  /** Clear data for a tab */
  clear(tabId: number): void {
    this.tabs.delete(tabId);
  }

  /** Clear data for all tabs */
  clearAll(): void {
    this.tabs.clear();
  }
}

export const dataStore = new DataStore();

// Clean up tab data when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  dataStore.clear(tabId);
});
