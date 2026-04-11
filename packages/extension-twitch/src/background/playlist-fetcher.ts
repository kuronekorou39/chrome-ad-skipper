import { parseMediaPlaylist, isMasterPlaylist } from '@ad-skipper/shared';
import type { ExtPlaylistUpdate, ExtAdDetected } from '@ad-skipper/shared';
import { broadcastToDevTools } from './broadcast';
import { dataStore } from './data-store';

/**
 * Fetches m3u8 playlists by URL and parses them for ad detection.
 * Since MV3 webRequest can't read response bodies, we re-fetch the URL.
 */
class PlaylistFetcher {
  /** Track recently fetched URLs to avoid duplicate fetches */
  private recentFetches = new Map<string, number>();
  private readonly DEDUP_INTERVAL_MS = 1000;

  /**
   * Fetch a playlist URL, parse it, and broadcast results.
   */
  async fetchAndParse(url: string, tabId: number): Promise<void> {
    // Dedup: skip if we fetched this URL very recently
    const lastFetch = this.recentFetches.get(url);
    if (lastFetch && Date.now() - lastFetch < this.DEDUP_INTERVAL_MS) {
      return;
    }
    this.recentFetches.set(url, Date.now());

    try {
      const response = await fetch(url);
      if (!response.ok) {
        return;
      }

      const text = await response.text();

      if (isMasterPlaylist(text)) {
        return;
      }

      // Media playlist
      const playlist = parseMediaPlaylist(text, url);

      // Store and broadcast
      const playlistMsg: ExtPlaylistUpdate = {
        source: 'twitch-swap',
        type: 'playlist-update',
        data: { tabId, playlist },
      };
      dataStore.add(tabId, playlistMsg);
      broadcastToDevTools(tabId, playlistMsg);

      // Check for ads
      if (playlist.adMarkers.length > 0) {
        const adMsg: ExtAdDetected = {
          source: 'twitch-swap',
          type: 'ad-detected',
          data: {
            tabId,
            markers: playlist.adMarkers,
            playlistUrl: url,
            timestamp: Date.now(),
          },
        };
        dataStore.add(tabId, adMsg);
        broadcastToDevTools(tabId, adMsg);
      }
    } catch {
      // Fetch failed — silently ignore
    }

    // Clean up old dedup entries
    this.cleanupDedupMap();
  }

  private cleanupDedupMap(): void {
    const cutoff = Date.now() - this.DEDUP_INTERVAL_MS * 10;
    for (const [url, time] of this.recentFetches) {
      if (time < cutoff) {
        this.recentFetches.delete(url);
      }
    }
  }
}

export const playlistFetcher = new PlaylistFetcher();
