import type { NetworkLogEntry, HlsRequestType } from '@ad-skipper/shared';
import { HLS_EXTENSIONS } from '@ad-skipper/shared';
import { broadcastToDevTools } from './broadcast';
import { dataStore } from './data-store';
import { playlistFetcher } from './playlist-fetcher';

let requestCounter = 0;
const pendingRequests = new Map<string, NetworkLogEntry>();

/**
 * Classify a URL as an HLS request type.
 */
function classifyRequest(url: string): HlsRequestType | null {
  const urlObj = new URL(url);
  const pathname = urlObj.pathname.toLowerCase();

  if (pathname.endsWith(HLS_EXTENSIONS.PLAYLIST)) {
    // Heuristic: master playlists often have certain patterns
    // This will be refined through observation
    if (pathname.includes('playlist') || pathname.includes('master')) {
      return 'master-playlist';
    }
    return 'media-playlist';
  }

  if (pathname.endsWith(HLS_EXTENSIONS.SEGMENT)) {
    return 'segment';
  }

  return null;
}

/**
 * Check if a URL is HLS-related (matches our domains and file extensions).
 */
function isHlsRelated(url: string): boolean {
  return classifyRequest(url) !== null;
}

/**
 * Set up webRequest listeners for HLS traffic monitoring.
 */
export function setupWebRequestLogger(): void {
  // Listen for request start
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      if (!isHlsRelated(details.url)) return;

      const type = classifyRequest(details.url) ?? 'unknown';
      const entry: NetworkLogEntry = {
        id: `req-${++requestCounter}-${Date.now()}`,
        url: details.url,
        method: details.method,
        type,
        statusCode: 0,
        startTime: details.timeStamp,
        tabId: details.tabId,
        requestId: details.requestId,
      };

      pendingRequests.set(details.requestId, entry);

      // If it's a playlist request, trigger a fetch+parse
      if (type === 'media-playlist' || type === 'master-playlist') {
        playlistFetcher.fetchAndParse(details.url, details.tabId);
      }
    },
    { urls: ['<all_urls>'] },
  );

  // Listen for response headers
  chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
      const entry = pendingRequests.get(details.requestId);
      if (!entry) return;

      entry.statusCode = details.statusCode;

      // Extract content-type from headers
      const contentType = details.responseHeaders?.find((h) => h.name.toLowerCase() === 'content-type');
      if (contentType?.value) {
        entry.contentType = contentType.value;
      }

      // Extract content-length
      const contentLength = details.responseHeaders?.find((h) => h.name.toLowerCase() === 'content-length');
      if (contentLength?.value) {
        entry.responseSize = parseInt(contentLength.value, 10);
      }
    },
    { urls: ['<all_urls>'] },
    ['responseHeaders'],
  );

  // Listen for request completion
  chrome.webRequest.onCompleted.addListener(
    (details) => {
      const entry = pendingRequests.get(details.requestId);
      if (!entry) return;

      entry.endTime = details.timeStamp;
      entry.duration = details.timeStamp - entry.startTime;
      entry.statusCode = details.statusCode;

      pendingRequests.delete(details.requestId);

      // Store and broadcast
      const message = {
        source: 'twitch-swap' as const,
        type: 'network-log' as const,
        data: entry,
      };

      dataStore.add(entry.tabId, message);
      broadcastToDevTools(entry.tabId, message);
    },
    { urls: ['<all_urls>'] },
  );

  // Clean up on error
  chrome.webRequest.onErrorOccurred.addListener(
    (details) => {
      pendingRequests.delete(details.requestId);
    },
    { urls: ['<all_urls>'] },
  );
}
