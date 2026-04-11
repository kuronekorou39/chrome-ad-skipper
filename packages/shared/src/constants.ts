/** Twitch CDN domains for HLS */
export const TWITCH_HLS_DOMAINS = ['*.hls.ttvnw.net', '*.ttvnw.net', '*.cloudfront.net'] as const;

/** URL patterns to match HLS-related requests */
export const HLS_URL_PATTERNS = ['*://*.hls.ttvnw.net/*', '*://*.ttvnw.net/*', '*://*.cloudfront.net/*'] as const;

/** File extensions for HLS resources */
export const HLS_EXTENSIONS = {
  PLAYLIST: '.m3u8',
  SEGMENT: '.ts',
} as const;

/** HLS ad-related tags to detect */
export const AD_TAGS = {
  CUE_OUT: '#EXT-X-CUE-OUT',
  CUE_OUT_CONT: '#EXT-X-CUE-OUT-CONT',
  CUE_IN: '#EXT-X-CUE-IN',
  DATERANGE: '#EXT-X-DATERANGE',
} as const;

/** Message source identifiers */
export const MESSAGE_SOURCE = {
  PAGE: 'twitch-swap-page',
  EXTENSION: 'twitch-swap',
  CONTENT: 'twitch-swap-content',
} as const;

/** Storage keys for chrome.storage.local */
export const STORAGE_KEYS = {
  NETWORK_LOGS: 'networkLogs',
  PLAYLISTS: 'playlists',
  VIDEO_STATES: 'videoStates',
  MEDIA_SOURCE_EVENTS: 'mediaSourceEvents',
  SETTINGS: 'settings',
} as const;

/** Maximum number of entries to keep in storage per category */
export const STORAGE_LIMITS = {
  NETWORK_LOGS: 1000,
  PLAYLISTS: 100,
  VIDEO_STATES: 500,
  MEDIA_SOURCE_EVENTS: 500,
} as const;
