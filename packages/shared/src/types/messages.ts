import type { NetworkLogEntry } from './network-log.js';
import type { VideoElementState, MediaSourceEvent } from './dom-state.js';
import type { HlsPlaylist, AdMarker } from './hls.js';

// ============================================================
// Messages between Page Script (MAIN world) and Content Script (ISOLATED world)
// Uses window.postMessage
// ============================================================

/** Base for all page<->content messages */
interface PageMessageBase {
  source: 'twitch-swap-page';
}

export interface PageMediaSourceEvent extends PageMessageBase {
  type: 'mediasource-event';
  data: MediaSourceEvent;
}

export interface PageFetchEvent extends PageMessageBase {
  type: 'fetch-intercept';
  data: {
    url: string;
    method: string;
    timestamp: number;
  };
}

export interface PageVideoEvent extends PageMessageBase {
  type: 'video-event';
  data: {
    event: string;
    src: string;
    currentTime: number;
    timestamp: number;
  };
}

export type PageMessage = PageMediaSourceEvent | PageFetchEvent | PageVideoEvent;

// ============================================================
// Messages between Content Script and Service Worker
// Uses chrome.runtime.sendMessage / chrome.runtime.connect
// ============================================================

interface ExtensionMessageBase {
  source: 'twitch-swap';
}

export interface ExtVideoStateUpdate extends ExtensionMessageBase {
  type: 'video-state-update';
  data: {
    tabId: number;
    videos: VideoElementState[];
    timestamp: number;
  };
}

export interface ExtMediaSourceUpdate extends ExtensionMessageBase {
  type: 'mediasource-update';
  data: {
    tabId: number;
    event: MediaSourceEvent;
  };
}

export interface ExtNetworkLogUpdate extends ExtensionMessageBase {
  type: 'network-log';
  data: NetworkLogEntry;
}

export interface ExtPlaylistUpdate extends ExtensionMessageBase {
  type: 'playlist-update';
  data: {
    tabId: number;
    playlist: HlsPlaylist;
  };
}

export interface ExtAdDetected extends ExtensionMessageBase {
  type: 'ad-detected';
  data: {
    tabId: number;
    markers: AdMarker[];
    playlistUrl: string;
    timestamp: number;
  };
}

export type ExtensionMessage =
  | ExtVideoStateUpdate
  | ExtMediaSourceUpdate
  | ExtNetworkLogUpdate
  | ExtPlaylistUpdate
  | ExtAdDetected;

// ============================================================
// Messages from Service Worker to DevTools Panel
// Uses chrome.runtime.connect (port)
// ============================================================

export interface DevToolsInitMessage {
  type: 'devtools-init';
  tabId: number;
}

export interface DevToolsDataMessage {
  type: 'devtools-data';
  data: {
    networkLogs: NetworkLogEntry[];
    playlists: HlsPlaylist[];
    videoStates: VideoElementState[];
    mediaSourceEvents: MediaSourceEvent[];
  };
}

export type DevToolsMessage = DevToolsInitMessage | DevToolsDataMessage;
