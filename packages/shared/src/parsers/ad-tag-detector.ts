import type { AdMarker, HlsPlaylist } from '../types/hls.js';

/** Summary of ad break info from a playlist */
export interface AdBreakInfo {
  /** Whether an ad break is currently active */
  active: boolean;
  /** Total ad break duration from CUE-OUT tag (seconds) */
  totalDuration?: number;
  /** Elapsed time in the ad break (seconds, from CUE-OUT-CONT) */
  elapsed?: number;
  /** Remaining time estimate (seconds) */
  remaining?: number;
  /** Number of ad segments in the current break */
  adSegmentCount: number;
  /** The CUE-OUT marker that started this break */
  startMarker?: AdMarker;
}

/**
 * Analyze a parsed playlist to extract ad break information.
 */
export function analyzeAdBreak(playlist: HlsPlaylist): AdBreakInfo {
  const { adMarkers, segments } = playlist;

  if (adMarkers.length === 0) {
    return { active: false, adSegmentCount: 0 };
  }

  // Find the latest CUE-OUT that hasn't been closed by CUE-IN
  let cueOut: AdMarker | undefined;
  let active = false;

  for (const marker of adMarkers) {
    if (marker.type === 'CUE-OUT') {
      cueOut = marker;
      active = true;
    } else if (marker.type === 'CUE-IN') {
      active = false;
      cueOut = undefined;
    }
  }

  // Also check for DATERANGE-based ads
  if (!active) {
    const hasTwitchAd = adMarkers.some(
      (m) => m.type === 'DATERANGE' && m.dateRangeAttributes?.['CLASS'] === 'twitch-stitched'
    );
    if (hasTwitchAd) {
      active = true;
    }
  }

  const adSegmentCount = segments.filter((s) => s.isAd).length;
  const totalDuration = cueOut?.duration;

  // Parse elapsed from CUE-OUT-CONT
  let elapsed: number | undefined;
  const lastCont = [...adMarkers].reverse().find((m) => m.type === 'CUE-OUT-CONT');
  if (lastCont) {
    // Format: #EXT-X-CUE-OUT-CONT:ElapsedTime/Duration
    const match = lastCont.raw.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
    if (match) {
      elapsed = parseFloat(match[1]);
    }
  }

  // Calculate remaining if possible
  let remaining: number | undefined;
  if (totalDuration != null && elapsed != null) {
    remaining = Math.max(0, totalDuration - elapsed);
  } else if (totalDuration != null) {
    // Estimate elapsed from ad segments
    const segElapsed = segments
      .filter((s) => s.isAd)
      .reduce((sum, s) => sum + s.duration, 0);
    remaining = Math.max(0, totalDuration - segElapsed);
  }

  return {
    active,
    totalDuration,
    elapsed,
    remaining,
    adSegmentCount,
    startMarker: cueOut,
  };
}

/**
 * Check if a URL pattern looks like a Twitch ad segment.
 * This is heuristic — actual detection should be based on playlist markers.
 */
export function isLikelyAdSegmentUrl(url: string): boolean {
  // Twitch ad segments may have different CDN paths or query params
  // This is speculative and will be refined based on actual traffic observation
  const lower = url.toLowerCase();
  return lower.includes('/ad/') || lower.includes('_ad_') || lower.includes('adsegment');
}
