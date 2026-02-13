// Type exports
export type {
  HlsSegment,
  HlsPlaylist,
  HlsMasterPlaylist,
  HlsVariant,
  AdMarker,
  AdState,
} from './types/hls.js';

export type { NetworkLogEntry, HlsRequestType } from './types/network-log.js';

export type {
  VideoElementState,
  MediaSourceEvent,
} from './types/dom-state.js';

export type {
  PageMessage,
  PageMediaSourceEvent,
  PageFetchEvent,
  PageVideoEvent,
  ExtensionMessage,
  ExtVideoStateUpdate,
  ExtMediaSourceUpdate,
  ExtNetworkLogUpdate,
  ExtPlaylistUpdate,
  ExtAdDetected,
  DevToolsMessage,
  DevToolsInitMessage,
  DevToolsDataMessage,
} from './types/messages.js';

// Parser exports
export {
  parseMediaPlaylist,
  parseMasterPlaylist,
  isMasterPlaylist,
} from './parsers/m3u8-parser.js';

export {
  analyzeAdBreak,
  isLikelyAdSegmentUrl,
} from './parsers/ad-tag-detector.js';

export type { AdBreakInfo } from './parsers/ad-tag-detector.js';

// Constants
export {
  TWITCH_HLS_DOMAINS,
  HLS_URL_PATTERNS,
  HLS_EXTENSIONS,
  AD_TAGS,
  MESSAGE_SOURCE,
  STORAGE_KEYS,
  STORAGE_LIMITS,
} from './constants.js';
